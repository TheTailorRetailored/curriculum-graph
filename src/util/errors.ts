export class CurriculumGraphError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "CurriculumGraphError";
  }
}
