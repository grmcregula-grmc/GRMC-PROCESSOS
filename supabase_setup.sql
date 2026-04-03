-- SQL Setup for Supabase

-- 1. Create the 'processes' table
CREATE TABLE IF NOT EXISTS public.processes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "fileUrls" TEXT[] DEFAULT '{}'::text[]
);

-- 2. Create the 'normativos' table
CREATE TABLE IF NOT EXISTS public.normativos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "fileUrls" TEXT[] DEFAULT '{}'::text[]
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normativos ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for 'processes'
CREATE POLICY "Users can view their own processes" 
ON public.processes FOR SELECT 
USING (auth.uid() = "userId");

CREATE POLICY "Users can insert their own processes" 
ON public.processes FOR INSERT 
WITH CHECK (auth.uid() = "userId");

CREATE POLICY "Users can update their own processes" 
ON public.processes FOR UPDATE 
USING (auth.uid() = "userId");

CREATE POLICY "Users can delete their own processes" 
ON public.processes FOR DELETE 
USING (auth.uid() = "userId");

-- 5. Create RLS Policies for 'normativos'
CREATE POLICY "Users can view their own normativos" 
ON public.normativos FOR SELECT 
USING (auth.uid() = "userId");

CREATE POLICY "Users can insert their own normativos" 
ON public.normativos FOR INSERT 
WITH CHECK (auth.uid() = "userId");

CREATE POLICY "Users can update their own normativos" 
ON public.normativos FOR UPDATE 
USING (auth.uid() = "userId");

CREATE POLICY "Users can delete their own normativos" 
ON public.normativos FOR DELETE 
USING (auth.uid() = "userId");

-- 6. Storage Setup (Run these in the Supabase SQL Editor)
-- Note: You also need to create the 'documents' bucket in the Supabase Storage UI.

-- Allow users to upload files to their own folder in 'documents' bucket
-- CREATE POLICY "Users can upload documents"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to view their own documents
-- CREATE POLICY "Users can view their own documents"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to delete their own documents
-- CREATE POLICY "Users can delete their own documents"
-- ON storage.objects FOR DELETE
-- USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
