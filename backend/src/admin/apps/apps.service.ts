import { Injectable } from '@nestjs/common';

@Injectable()
export class AppsService {
  list() {
    return { items: [] };
  }

  create(body: object) {
    const appId = `app-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const b = body as { name: string; domains: string[]; enabled: boolean };
    return {
      app_id: appId,
      name: b.name ?? 'New app',
      domains: b.domains ?? [],
      enabled: b.enabled ?? true,
      updated_at: now,
    };
  }

  update(appId: string, body: object) {
    const b = body as { name?: string; domains?: string[]; enabled?: boolean };
    return {
      app_id: appId,
      name: b.name ?? 'App',
      domains: b.domains ?? [],
      enabled: b.enabled ?? true,
      updated_at: new Date().toISOString(),
    };
  }
}
