// class-transformer/class-validator's decorators (@Type, @IsInt, ...) read
// design-time type metadata via Reflect.getMetadata, which only exists
// once this polyfill has run. The real app gets it as a side effect of
// Nest's own bootstrap; a DTO spec that imports the class directly (no
// Nest app involved) needs it loaded explicitly, before any decorated
// class is evaluated.
import 'reflect-metadata';

// Pinned so date-formatting tests (invite expiry, due dates, ...) are
// deterministic regardless of which timezone the machine or CI runner
// running them happens to be in.
process.env.TZ = 'UTC';

// Module-wiring specs compile the real PrismaModule (so Nest's DI graph
// resolves), then override PrismaService with a mock before anything
// calls a query — PrismaService's own constructor just needs *a* valid-
// looking connection string to build without throwing, never a real
// database. Never used to actually connect.
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';

// config-validation.schema.ts's Joi schema (read by AppModule's
// ConfigModule.forRoot()) requires these at boot — main.spec.ts imports
// the real AppModule (through main.ts), so without these set the import
// itself throws before any test runs. These happened to already be set
// in a local dev shell, which is why this only surfaced in CI, not
// locally — never used to actually reach Google or sign a real token.
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.GOOGLE_CALLBACK_URL ??=
  'http://localhost:3001/auth/google/callback';
process.env.JWT_SECRET ??= 'test-jwt-secret';
