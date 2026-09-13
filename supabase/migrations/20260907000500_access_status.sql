CREATE OR REPLACE FUNCTION public.list_registration_access_status()
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  matricula text,
  sector text,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz,
  has_account boolean,
  expired boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.full_name,
    e.matricula,
    e.sector,
    r.expires_at,
    r.used_at,
    r.created_at,
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE lower(trim(p.matricula)) = lower(trim(e.matricula))
    ) AS has_account,
    COALESCE(r.used_at IS NULL AND r.expires_at IS NOT NULL AND r.expires_at < now(), false) AS expired
  FROM public.employees e
  LEFT JOIN public.registration_activation_codes r ON r.employee_id = e.id
  WHERE e.status = 'Ativo'
  ORDER BY e.full_name ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_registration_access_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_registration_access_status() TO authenticated;
