'use client';
import { useEffect, useRef } from 'react';
import type { Layer } from '@/lib/map-data';
type Input = { year?: number; layer?: Layer; municipalityId?: string };
type State = {
  year: number;
  layer: Layer;
  municipalityId: string | null;
  loading: boolean;
  configure: (input: Input) => Promise<unknown>;
};
type Context = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function useMapTools(state: State) {
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const read = () => ({
      year: current.current.year,
      layer: current.current.layer,
      municipalityId: current.current.municipalityId,
      loading: current.current.loading,
    });
    const tools = [
      {
        name: 'read_map_selection',
        description:
          'Read the selected year, layer and municipality in the VIGIAR map.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => read(),
      },
      {
        name: 'configure_map_view',
        description:
          'Change the visible map filters to explore a year, data layer, and optional municipality. Does not modify source data.',
        inputSchema: {
          type: 'object',
          properties: {
            year: { type: 'integer', minimum: 2021, maximum: 2026 },
            layer: {
              type: 'string',
              enum: ['notifications', 'temperature', 'rain', 'cnes', 'udh'],
            },
            municipalityId: { type: 'string', pattern: '^[0-9]{7}$' },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (raw: unknown) => {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            throw new Error('Expected an object');
          const input = raw as Input;
          if (
            Object.keys(input).some(
              (k) => !['year', 'layer', 'municipalityId'].includes(k),
            )
          )
            throw new Error('Unknown filter');
          if (
            input.year !== undefined &&
            (!Number.isInteger(input.year) ||
              input.year < 2021 ||
              input.year > 2026)
          )
            throw new Error('Year must be 2021–2026');
          if (
            input.layer !== undefined &&
            !['notifications', 'temperature', 'rain', 'cnes', 'udh'].includes(
              input.layer,
            )
          )
            throw new Error('Unknown layer');
          if (
            input.municipalityId !== undefined &&
            !/^\d{7}$/.test(input.municipalityId)
          )
            throw new Error('Invalid municipality code');
          await current.current.configure(input);
          await new Promise<void>((resolve, reject) => {
            let tries = 0;
            const check = () => {
              if (controller.signal.aborted)
                return reject(new Error('Page closed'));
              const s = read();
              if (++tries > 200)
                return reject(new Error('Map update timed out'));
              if (tries > 1 && !s.loading) return resolve();
              setTimeout(check, 50);
            };
            check();
          });
          return read();
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: controller.signal }),
        ).catch(() => {
          /* Optional browser capability. */
        });
      } catch {
        /* Unsupported context does not affect the map. */
      }
    }
    return () => controller.abort();
  }, []);
}
