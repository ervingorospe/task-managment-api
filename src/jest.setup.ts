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
