-- Migration to add secret question and answer to customer_profiles

ALTER TABLE public.customer_profiles 
ADD COLUMN IF NOT EXISTS secret_question text,
ADD COLUMN IF NOT EXISTS secret_answer text;
