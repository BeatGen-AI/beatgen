/* tslint:disable */
/* eslint-disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

export type GenreType = "pop" | "rock" | "jazz" | "blues" | "country" | "hip_hop" | "rap" | "electronic";
export type DrumSampleType =
  | "kick"
  | "snare"
  | "closed_hh"
  | "open_hh"
  | "crash"
  | "ride"
  | "tom"
  | "rim"
  | "clap"
  | "cymbal"
  | "eight_o_eight"
  | "perc"
  | "hit"
  | "fx";
export type GenreType1 = "pop" | "rock" | "jazz" | "blues" | "country" | "hip_hop" | "rap" | "electronic";
export type DrumSampleType1 =
  | "kick"
  | "snare"
  | "closed_hh"
  | "open_hh"
  | "crash"
  | "ride"
  | "tom"
  | "rim"
  | "clap"
  | "cymbal"
  | "eight_o_eight"
  | "perc"
  | "hit"
  | "fx";

/**
 * Drum sample model
 */
export interface DrumSamplePublic {
  created_at?: string;
  updated_at?: string;
  id?: string;
  file_name: string;
  display_name: string;
  storage_key: string;
  file_format: string;
  file_size: number;
  genre: GenreType;
  category: DrumSampleType;
  kit_name: string;
  duration?: number | null;
  description?: string | null;
  waveform_data?: number[] | null;
  storage_type?: "USER_AUDIO" | "USER_SAMPLE" | "PUBLIC_DRUM" | "PUBLIC_SOUNDFONT";
}
/**
 * Base model for drum samples
 */
export interface DrumSamplePublicBase {
  created_at?: string;
  updated_at?: string;
  id: string;
  file_name: string;
  display_name: string;
  storage_key: string;
  file_format: string;
  file_size: number;
  genre: GenreType;
  category: DrumSampleType;
  kit_name: string;
  duration?: number | null;
  description?: string | null;
  waveform_data?: number[] | null;
}
/**
 * Drum sample create model
 */
export interface DrumSamplePublicCreate {
  created_at?: string;
  updated_at?: string;
  id: string;
  file_name: string;
  display_name: string;
  storage_key: string;
  file_format: string;
  file_size: number;
  genre: GenreType;
  category: DrumSampleType;
  kit_name: string;
  duration?: number | null;
  description?: string | null;
  waveform_data?: number[] | null;
}
/**
 * Drum sample delete model
 */
export interface DrumSamplePublicDelete {
  id: string;
}
/**
 * Drum sample read model
 */
export interface DrumSamplePublicRead {
  created_at?: string;
  updated_at?: string;
  id: string;
  file_name: string;
  display_name: string;
  storage_key: string;
  file_format: string;
  file_size: number;
  genre: GenreType;
  category: DrumSampleType;
  kit_name: string;
  duration?: number | null;
  description?: string | null;
  waveform_data?: number[] | null;
}
/**
 * Drum sample update model
 */
export interface DrumSamplePublicUpdate {
  created_at?: string;
  updated_at?: string;
  id: string;
  file_name?: string;
  display_name?: string;
  storage_key?: string;
  file_format?: string;
  file_size?: number;
  genre?: GenreType1;
  category?: DrumSampleType1;
  kit_name?: string;
  duration?: number | null;
  description?: string | null;
  waveform_data?: number[] | null;
}
export interface SQLModel {}
