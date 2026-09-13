with names(idx, name) as (
  values (0,'السبت'),(1,'الأحد'),(2,'الإثنين'),(3,'الثلاثاء'),(4,'الأربعاء'),(5,'الخميس'),(6,'الجمعة')
)
update public.dulms_items i
set title = n2.name || substring(i.title from length(n1.name) + 1)
from names n1
join names n2 on n2.idx = (n1.idx + 1) % 7
where i.kind = 'schedule'
  and i.title like n1.name || ' •%';