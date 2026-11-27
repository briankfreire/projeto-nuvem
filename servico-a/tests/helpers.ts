import type { IdGenerator } from "../src/shared/id-generator";

export class SequentialIds implements IdGenerator {
  private n = 0;
  next() {
    this.n += 1;
    return `00000000-0000-4000-8000-${String(this.n).padStart(12, "0")}`;
  }
}
