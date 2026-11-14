import { readFile } from 'node:fs/promises';
import { buildFestivalData } from '../../src/backend/data/load';
import { tablesFromDir } from '../../src/backend/data/sheets';
import type { FestivalData, Trigger } from '../../src/backend/domain/types';
import { MemoryStore, initialState } from '../../src/backend/engine/store';
import type { Llm } from '../../src/backend/llm/ollama';
import type { ScenarioFile } from '../../src/backend/scenarios';
import { forecastFrom } from '../../src/backend/scenarios';
import { OpsBackend } from '../../src/backend/service';

export const DAY1 = '2027-04-15';
export const t = (hhmm: string) => `${DAY1}T${hhmm}`;

export async function loadData(): Promise<FestivalData> {
  return buildFestivalData(await tablesFromDir('data/harbor-lights', 'data/scenario-extras')).data;
}

export function backendFor(data: FestivalData, llm: Llm | null = null) {
  return new OpsBackend({ data, store: new MemoryStore(() => initialState(data, t('11:00'))), llm });
}

export async function scenario(name: string): Promise<ScenarioFile> {
  return JSON.parse(await readFile(`data/scenarios/${name}.json`, 'utf8'));
}

export const SNOW = forecastFrom(DAY1, {
  source: 'test feed', issued: '13:05',
  hourly: { '14:00': 0.5, '15:00': 0.7, '16:00': 0.7, '17:00': 0.6, '18:00': 0.45, '19:00': 0.05 },
});

export const snowAt = (hhmm: string): Trigger => ({ type: 'weather_update', at: t(hhmm), forecast: SNOW });
