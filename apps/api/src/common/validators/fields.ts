/** Shared field rules and transforms for DTOs, so every module validates the same things the same way. */

export const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const upperTrimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
export const lowerTrimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const PHONE = /^\+?[0-9 ()-]{7,20}$/;
export const US_STATE = /^[A-Z]{2}$/;
export const US_ZIP = /^\d{5}(-\d{4})?$/;
/** A UK postcode, e.g. "M1 1AA", "SW1A 2AA" (upper-cased, single optional space). */
export const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/;
