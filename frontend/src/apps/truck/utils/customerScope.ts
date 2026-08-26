import type { Customer } from '../types';

/** Customer choices must be scoped to the currently selected truck. */
export function customersForTruck(customers: Customer[], truckId: string) {
  return customers.filter((customer) => customer.truckId === truckId);
}
