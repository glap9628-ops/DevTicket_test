-- Migration 002: dts_tickets에 product_name 컬럼 추가
ALTER TABLE public.dts_tickets ADD COLUMN IF NOT EXISTS product_name VARCHAR(50);
