// Fix the timezone so date formatting tests are deterministic on every machine.
export default function setup() {
  process.env.TZ = 'UTC';
}
