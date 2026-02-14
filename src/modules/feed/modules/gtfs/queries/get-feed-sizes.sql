/* @name GetFeedSizes */
select
  split_part(inf.table_name, '__', 1) as "table_name!",
  split_part(inf.table_name, '__', 2) as "feed_code!",
  (pg_total_relation_size(quote_ident(table_name)) / 1000)::int as "size_kb!"
from
  information_schema.tables inf
where
  table_name like '%\_\_%'
order by
  "size_kb!" desc;