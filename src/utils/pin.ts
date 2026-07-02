import bcrypt from "bcryptjs";

const PIN_SALT_ROUNDS = 10;

export const isValidPinFormat = (pin: string): boolean => /^\d{4,6}$/.test(pin);

export const hashPin = async (pin: string): Promise<string> => {
  return bcrypt.hash(pin, PIN_SALT_ROUNDS);
};

export const verifyPin = async (pin: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(pin, hash);
};
