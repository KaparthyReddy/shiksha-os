const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwertyui", "qwerty123", "11111111", "iloveyou", "admin123", "welcome1", "letmein1",
]);

/** Returns a message explaining what's wrong with a password, or null when it is acceptable. */
export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 128) return "Use at most 128 characters.";
  if (COMMON.has(pw.toLowerCase())) return "That password is too common. Choose something harder to guess.";
  if (/^(.)\1+$/.test(pw)) return "Use more than one repeated character.";
  if (email && pw.toLowerCase() === email.toLowerCase()) return "Your password can't be your email address.";
  return null;
}
