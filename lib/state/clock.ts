export const now = () => process.env.DEMO_FIXED_NOW ? new Date(process.env.DEMO_FIXED_NOW).toISOString() : new Date().toISOString();
export const today = () => now().slice(0, 10);
let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
export const isOffHours = (iso = now()) => { const h = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Shanghai" })).getHours(); return h >= 18 || h < 8; };
