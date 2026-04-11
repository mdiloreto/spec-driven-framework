// -- OpenSpec Client Interface & Response Types --

export interface OpenSpecClient {
  status(changeName: string): Promise<OpenSpecChangeStatus>;
  instructions(
    artifactId: string,
    changeName: string,
  ): Promise<OpenSpecArtifactInstructions>;
  list(): Promise<OpenSpecChangeListItem[]>;
  listSpecs(): Promise<OpenSpecSpecListItem[]>;
  validate(name: string): Promise<OpenSpecValidationResult>;
  validateAll(): Promise<OpenSpecValidationResult>;
}

export interface OpenSpecChangeStatus {
  changeName: string;
  schemaName: string;
  isComplete: boolean;
  artifacts: {
    id: string;
    outputPath: string;
    status: "ready" | "blocked" | "done";
    missingDeps?: string[];
  }[];
}

export interface OpenSpecArtifactInstructions {
  changeName: string;
  artifactId: string;
  instruction: string;
  context: string;
  template: string;
  outputPath: string;
}

export interface OpenSpecChangeListItem {
  name: string;
  path: string;
  completedTasks?: number;
  totalTasks?: number;
  lastModified?: string;
  status?: string;
}

export interface OpenSpecSpecListItem {
  name: string;
  path: string;
}

export interface OpenSpecValidationResult {
  valid: boolean;
  errors: string[];
}
