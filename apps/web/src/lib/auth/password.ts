import bcrypt from "bcryptjs";

/** Стоимость bcrypt: ~250ms на 1 vCPU при cost=12. Для single-user — норм. */
const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
