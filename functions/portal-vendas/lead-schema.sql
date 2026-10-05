begin;
alter table public.portal_vendas_funil add column if not exists documento text;
alter table public.portal_vendas_funil add column if not exists client_id text;
alter table public.portal_vendas_funil add column if not exists estado text;
alter table public.portal_vendas_funil add column if not exists categoria text;
alter table public.portal_vendas_funil add column if not exists responsavel text;
alter table public.portal_vendas_funil add column if not exists produto_sugerido text;
alter table public.portal_vendas_funil add column if not exists cliente_avec boolean;
alter table public.portal_vendas_funil add column if not exists em_atendimento boolean;
alter table public.portal_vendas_funil add column if not exists dados_origem jsonb;
create or replace function public.portal_create_sales_lead(p_franchise text,p_creator text,p_name text,p_lead jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing public.portal_vendas_funil;created public.portal_vendas_funil;phone text;doc text;cid text;origin_id text;
begin
 if p_franchise is null or p_franchise='' then raise exception 'Franquia obrigatória';end if;
 perform pg_advisory_xact_lock(hashtextextended('avec-sales:'||p_franchise,0));
 phone=regexp_replace(coalesce(nullif(p_lead->>'whatsapp',''),p_lead->>'phone',p_lead->>'telefone',''),'[^0-9]','','g');
 if length(phone) in(10,11) then phone='55'||phone;end if;
 doc=nullif(regexp_replace(coalesce(p_lead->>'document',p_lead->>'documento',''),'[^0-9]','','g'),'');
 cid=nullif(coalesce(p_lead->>'client_id',p_lead->>'cliente_id'),'');origin_id=nullif(coalesce(p_lead->>'place_id',p_lead->>'origem_id'),'');
 select * into existing from portal_vendas_funil v where v.franquia_id=p_franchise and ((length(phone)>=10 and (case when length(regexp_replace(v.telefone,'[^0-9]','','g')) in(10,11) then '55'||regexp_replace(v.telefone,'[^0-9]','','g') else regexp_replace(v.telefone,'[^0-9]','','g') end)=phone) or (doc is not null and v.documento=doc) or (cid is not null and v.client_id=cid) or (origin_id is not null and v.origem='extrator' and v.origem_id=origin_id)) order by criado_em limit 1;
 if existing.id is not null then return jsonb_build_object('duplicado',true,'deal',to_jsonb(existing));end if;
 insert into portal_vendas_funil(franquia_id,criado_por,criado_por_nome,cliente,contato,telefone,telefone_digits,cidade,endereco,origem,origem_id,etapa,valor,observacoes,documento,client_id,estado,categoria,responsavel,produto_sugerido,cliente_avec,em_atendimento,dados_origem)
 values(p_franchise,p_creator,p_name,left(coalesce(nullif(p_lead->>'name',''),p_lead->>'cliente','Lead sem nome'),300),left(coalesce(p_lead->>'contact',p_lead->>'contato'),200),nullif(phone,''),nullif(phone,''),left(coalesce(p_lead->>'city',p_lead->>'cidade'),160),left(coalesce(p_lead->>'address',p_lead->>'endereco'),400),'extrator',origin_id,'nao_iniciado',0,left(coalesce(p_lead->>'notes',p_lead->>'observacoes','Enviado pelo Extrator de Leads'),2000),doc,cid,left(coalesce(p_lead->>'state',p_lead->>'estado'),80),left(coalesce(p_lead->>'category',p_lead->>'categoria'),200),left(coalesce(p_lead->>'responsavel',p_name),200),left(coalesce(p_lead->>'suggested_product',p_lead->>'produto_sugerido',p_lead->>'produto_recomendado'),300),coalesce(p_lead->>'cliente_avec','false')='true' or p_lead#>>'{client_match,status}'='cliente',coalesce(p_lead->>'em_atendimento','false')='true' or p_lead->'funil_match' is not null and p_lead->'funil_match'<>'null'::jsonb,p_lead)
 returning * into created;
 return jsonb_build_object('duplicado',false,'deal',to_jsonb(created));
end;$$;
revoke all on function public.portal_create_sales_lead(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.portal_create_sales_lead(text,text,text,jsonb) to service_role;
commit;
