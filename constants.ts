export const RESPONSES = {
  IND_2: "You are about to transfer {amount} RWF to {name} ({number}). Enter your PIN to confirm.",
  BUSS: "You are about to pay {amount} RWF to {name} ({number}). Enter your PIN to confirm.",
};

export const replaceInString = (template: string, values: Record<string, string | number>) => {
  return Object.entries(values).reduce((str, [key, value]) => {
    return str.replace(new RegExp(`{${key}}`, 'g'), String(value));
  }, template);
}; 