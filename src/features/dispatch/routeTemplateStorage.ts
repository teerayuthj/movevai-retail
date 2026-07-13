import type { RouteTemplate } from '@/features/dispatch/types';

const STORAGE_KEY = 'movevai-retail:route-templates:v1';

export function loadRouteTemplates(): RouteTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RouteTemplate[];
    return Array.isArray(parsed)
      ? parsed.filter((template) => template && Array.isArray(template.stops))
      : [];
  } catch {
    return [];
  }
}

export function saveRouteTemplates(templates: RouteTemplate[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  window.dispatchEvent(new CustomEvent('movevai:route-templates-changed'));
}

export function upsertRouteTemplate(template: RouteTemplate) {
  const current = loadRouteTemplates();
  const next = current.some((item) => item.id === template.id)
    ? current.map((item) => (item.id === template.id ? template : item))
    : [template, ...current];
  saveRouteTemplates(next);
  return next;
}

export function deleteRouteTemplate(templateId: string) {
  const next = loadRouteTemplates().filter((template) => template.id !== templateId);
  saveRouteTemplates(next);
  return next;
}

export function markTemplateGenerated(templateId: string, dateKey: string) {
  const next = loadRouteTemplates().map((template) =>
    template.id === templateId
      ? {
          ...template,
          generatedDateKeys: [...new Set([...(template.generatedDateKeys ?? []), dateKey])].slice(
            -90,
          ),
          updatedAt: new Date().toISOString(),
        }
      : template,
  );
  saveRouteTemplates(next);
}
