select cron.alter_job(jobid, command := replace(command, 'https://project--4fe688c7-bb67-41fe-90ce-391a265a169c.lovable.app', 'https://dulms-notify.lovable.app'))
from cron.job
where command like '%4fe688c7-bb67-41fe-90ce-391a265a169c%';