import { Injectable } from '@nestjs/common';

@Injectable()
export class DetectorsService {
  list() {
    return {
      items: [
        {
          detector_id: 'pii',
          type: 'PII',
          enabled: true,
          config: {},
          version: 1,
          updated_at: new Date().toISOString(),
        },
        {
          detector_id: 'secrets',
          type: 'SECRETS',
          enabled: true,
          config: {},
          version: 1,
          updated_at: new Date().toISOString(),
        },
        {
          detector_id: 'code',
          type: 'CODE',
          enabled: true,
          config: {},
          version: 1,
          updated_at: new Date().toISOString(),
        },
      ],
    };
  }

  update(detectorId: string, body: object) {
    return {
      detector_id: detectorId,
      type: 'PII',
      enabled: true,
      config: (body as { config?: object }).config ?? {},
      version: 2,
      updated_at: new Date().toISOString(),
    };
  }
}
