import { zodResolver as hookFormZodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';

export function zodResolver<TFieldValues extends FieldValues>(
  schema: unknown
): Resolver<TFieldValues> {
  return hookFormZodResolver(schema as never) as unknown as Resolver<TFieldValues>;
}
