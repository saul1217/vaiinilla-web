export function isUnpublishedLegalTestingEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export const unpublishedLegalTestingEnabled = isUnpublishedLegalTestingEnabled(
  import.meta.env.VITE_ALLOW_UNPUBLISHED_LEGAL_TESTING,
);
