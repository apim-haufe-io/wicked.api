UPDATE wicked.approvals a
SET data = jsonb_set(a.data, '{application, description}', b.data->'description')
FROM wicked.applications b
WHERE b.id = a.data->'application'->>'id';
