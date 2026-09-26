// Shared whitelist for embedding a User relation (Member.user,
// TicketComment.author, etc.) in a response — never `include: { user: true }`,
// which returns every column, including passwordHash/googleId/
// verificationToken/verificationTokenExpiry. Mirrors what the frontend's
// RawUser type (ticketing-app/lib/api/raw-types.ts) actually expects.
export const PUBLIC_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  avatar: true,
  isActive: true,
  isDeleted: true,
  isVerified: true,
  hasOnboarded: true,
  createdAt: true,
  updatedAt: true,
} as const;
