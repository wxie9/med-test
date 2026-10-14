import { getStore, replaceStore, resetStore, type DemoStore } from '@/lib/state/store';
export const PSP_TEST_NOW='2026-10-13T02:00:00.000Z';
export function buildPspTestStore():DemoStore {const previous=getStore();resetStore();const isolated=getStore();replaceStore(previous);return isolated;}
export function installPspTestStore(store:DemoStore):void {replaceStore(store);}
