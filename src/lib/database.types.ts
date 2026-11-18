export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type QuestionKind = "single" | "multiple" | "yes_no";

export type Database = {
  public: {
    Tables: {
      quizzes: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          created_at: string;
          is_shared: boolean;
          question_count: number;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          created_at?: string;
          is_shared?: boolean;
          question_count?: number;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          created_at?: string;
          is_shared?: boolean;
          question_count?: number;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          id: string;
          quiz_id: string;
          position: number;
          category: string;
          prompt: string;
          choices: Json;
          kind: QuestionKind;
        };
        Insert: {
          id?: string;
          quiz_id: string;
          position: number;
          category: string;
          prompt: string;
          choices: Json;
          kind: QuestionKind;
        };
        Update: {
          id?: string;
          quiz_id?: string;
          position?: number;
          category?: string;
          prompt?: string;
          choices?: Json;
          kind?: QuestionKind;
        };
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey";
            columns: ["quiz_id"];
            isOneToOne: false;
            referencedRelation: "quizzes";
            referencedColumns: ["id"];
          },
        ];
      };
      answer_keys: {
        Row: {
          question_id: string;
          answer: Json;
          explanation: string;
        };
        Insert: {
          question_id: string;
          answer: Json;
          explanation: string;
        };
        Update: {
          question_id?: string;
          answer?: Json;
          explanation?: string;
        };
        Relationships: [
          {
            foreignKeyName: "answer_keys_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: true;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      attempts: {
        Row: {
          id: string;
          user_id: string;
          quiz_id: string;
          question_ids: string[];
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          quiz_id: string;
          question_ids: string[];
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          quiz_id?: string;
          question_ids?: string[];
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attempts_quiz_id_fkey";
            columns: ["quiz_id"];
            isOneToOne: false;
            referencedRelation: "quizzes";
            referencedColumns: ["id"];
          },
        ];
      };
      responses: {
        Row: {
          attempt_id: string;
          question_id: string;
          response: Json;
          correct: boolean;
          submitted_at: string;
        };
        Insert: {
          attempt_id: string;
          question_id: string;
          response: Json;
          correct: boolean;
          submitted_at?: string;
        };
        Update: {
          attempt_id?: string;
          question_id?: string;
          response?: Json;
          correct?: boolean;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "responses_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "responses_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_quiz: {
        Args: { p_title: string; p_questions: Json };
        Returns: string;
      };
      set_quiz_sharing: {
        Args: { p_quiz_id: string; p_shared: boolean };
        Returns: boolean;
      };
      get_quiz_for_study: {
        Args: { p_quiz_id: string };
        Returns: Json;
      };
      start_attempt: {
        Args: {
          p_quiz_id: string;
          p_categories?: string[] | null;
          p_shuffle?: boolean;
        };
        Returns: string;
      };
      get_attempt: {
        Args: { p_attempt_id: string };
        Returns: Json;
      };
      submit_answer: {
        Args: {
          p_attempt_id: string;
          p_question_id: string;
          p_response: Json;
        };
        Returns: Json;
      };
      list_my_attempts: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
