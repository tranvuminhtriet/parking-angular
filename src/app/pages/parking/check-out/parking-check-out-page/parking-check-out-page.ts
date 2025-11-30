import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { combineLatest, map, Observable, take } from 'rxjs';
import { ActiveParking } from '../../../../core/models/active-parking.model';
import { Vehicle } from '../../../../core/models/vehicle.model';
import { ParkingService } from '../../../../core/services/parking.service';
import { PricingService } from '../../../../core/services/pricing.service';

@Component({
  selector: 'app-parking-check-out-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parking-check-out-page.html',
  styleUrl: './parking-check-out-page.css',
})
export class ParkingCheckOutPage {
  private readonly parking = inject(ParkingService);
  private readonly pricing = inject(PricingService);

  readonly activeParkings$ = this.parking.getActiveParkings$();
  readonly vehicles$ = this.parking.getVehicles$();

  // Combine to get both vehicles and active parkings
  readonly parkingData$: Observable<{
    vehicles: Vehicle[];
    activeParkings: ActiveParking[];
  }> = combineLatest([this.vehicles$, this.activeParkings$]).pipe(
    map(([vehicles, activeParkings]) => ({ vehicles, activeParkings }))
  );

  licensePlate = '';

  selectedVehicle: Vehicle | null = null;
  selectedActive: ActiveParking | null = null;

  readonly durationHours = computed(() => {
    if (!this.selectedActive) return 0;
    const now = new Date();
    return this.calculateDurationHours(this.selectedActive.checkInTime, now);
  });

  readonly fee = computed(() => {
    if (!this.selectedVehicle || !this.durationHours()) return 0;
    return this.pricing.calculateFee(this.selectedVehicle.type, this.durationHours());
  });

  error = '';
  message = '';
  isLoading = false;

  protected search(): void {
    this.error = '';
    this.message = '';
    this.selectedVehicle = null;
    this.selectedActive = null;

    const plate = this.licensePlate.trim();
    if (!plate) {
      this.error = 'Please enter license plate.';
      return;
    }

    // Subscribe to find vehicle and active parking (take only 1 value)
    this.parkingData$.pipe(take(1)).subscribe(({ vehicles, activeParkings }) => {
      const vehicle = vehicles.find((v) => v.licensePlate === plate);
      if (!vehicle) {
        this.error = `Vehicle with license plate "${plate}" not found.`;
        return;
      }

      const active = activeParkings.find((a) => a.vehicleId === vehicle.id);
      if (!active) {
        this.error = `Vehicle "${plate}" is not currently in the parking lot.`;
        return;
      }

      this.selectedVehicle = vehicle;
      this.selectedActive = active;
    });
  }

  protected confirmCheckout(): void {
    if (!this.selectedVehicle || !this.selectedActive) {
      this.error = 'Please search for vehicle before check-out.';
      return;
    }

    this.error = '';
    this.message = '';
    this.isLoading = true;

    const plate = this.selectedVehicle.licensePlate;
    const fee = this.fee();

    this.parking.checkOutByLicense(plate).subscribe({
      next: () => {
        this.message = `Vehicle ${plate} checked out successfully. Parking fee: ${fee.toLocaleString()} VND.`;
        this.selectedVehicle = null;
        this.selectedActive = null;
        this.licensePlate = '';
        this.isLoading = false;
      },
      error: (e: unknown) => {
        this.error = e instanceof Error ? e.message : 'An error occurred during check-out.';
        this.isLoading = false;
      },
    });
  }

  private calculateDurationHours(checkIn: Date, now: Date): number {
    const start = new Date(checkIn).getTime();
    const end = now.getTime();
    const diffMs = Math.max(end - start, 0);
    const hours = diffMs / (1000 * 60 * 60);
    return Math.max(1, Math.ceil(hours)); // minimum 1 hour
  }
}
