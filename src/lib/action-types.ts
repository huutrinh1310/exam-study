import type { ImportError } from "./import";
import type { QuestionInput } from "./quiz";

export interface ActionState {
  error?: string;
  message?: string;
  shareEnabled?: boolean;
}

export interface ImportState extends ActionState {
  questions?: QuestionInput[];
  errors?: ImportError[];
  fileName?: string;
}

export interface AuthActionState {
  error?: string;
  message?: string;
}
