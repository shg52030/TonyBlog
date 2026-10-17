---
author: "Tony"
pubDatetime: 2025-11-02T01:12:00+08:00
title: "批处理又变慢了"
featured: true
draft: false
tags:
  - Oracle
  - 性能优化
  - 运维
description: "第一年二十分钟，第三年一小时。客户开始打电话问几点能出数。"
---

银行绩效系统的月度计算是个典型批处理：把一个月里各机构、各条线、各人员的业绩数据抽出来，按考核方案逐项算分，算完做二次分配，最后落表。

刚上线时跑得挺快。第二年第三年开始变慢，慢到客户会专门打电话来问"今天结果几点能出来"。这话听着客气，压力一点不小。

## 先别急着加内存

遇到批处理慢，最常见的两种反应是加内存、加 CPU。我在现场见过太多"机器升了配，速度没变"的例子。

因为慢的原因通常不是资源不够，是资源被用错了地方。所以第一步永远是定位，不是扩容。

我一般问自己三个问题：会话在等什么？哪条 SQL 最重？为什么慢？

没有 AWR 权限的时候，这几张视图够用：

```sql
-- 当前会话在等什么
select sid, event, wait_class, seconds_in_wait, sql_id
from v$session
where status = 'ACTIVE' and username is not null;

-- 累计耗时最高的 SQL
select sql_id, executions,
       round(elapsed_time/1000000, 1) as elapsed_s,
       round(elapsed_time/1000000/greatest(executions,1), 3) as avg_s,
       substr(sql_text,1,80) as sql_head
from v$sql
order by elapsed_time desc
fetch first 20 rows only;
```

拿到 `sql_id` 再看计划：

```sql
select * from table(dbms_xplan.display_cursor('&sql_id', null, 'ALLSTATS LAST'));
```

## 后来查出来就这几种

最常见的是索引列被函数包住了。条件写成 `where to_char(stat_date,'yyyymm')='202609'`，`stat_date` 上的索引直接失效，走全表。改成范围查询就好了：

```sql
where stat_date >= date '2026-09-01'
  and stat_date <  date '2026-10-01'
```

这类问题的特点是，单看 SQL 都对，但它让你的索引白建了。

还有隐式类型转换。字段是 `varchar2`，条件里传了数字，或者反过来。Oracle 会隐式转，一旦转换发生在列这一侧，索引就用不上。而且不报错，只是悄悄变慢。看执行计划的谓词信息，里面会带 `TO_NUMBER(...)` 这种痕迹，看到就要警觉。

再就是逐行提交。原来的存储过程是循环里一条条 insert 一条条 commit，数据量一上来，提交次数和时间一起涨。改成分批：

```sql
declare
  cursor c is select * from tmp_result where batch_id = p_batch;
  type t_tab is table of tmp_result%rowtype;
  v_rows t_tab;
begin
  open c;
  loop
    fetch c bulk collect into v_rows limit 1000;
    exit when v_rows.count = 0;

    forall i in 1 .. v_rows.count
      insert into result_table values v_rows(i);

    commit;   -- 每千条提交一次
  end loop;
  close c;
end;
```

这一改带来的提升，往往比调索引还明显。

最后一个比较隐蔽，统计信息过期。数据量长了，统计信息还是几个月前的，优化器按老数据估行数，连接方式就选错了。

```sql
select table_name, last_analyzed, num_rows
from user_tables
where table_name in ('RESULT_TABLE','TMP_RESULT','BIZ_DETAIL');
```

批处理前跑一次 `dbms_stats.gather_table_stats`，或者在非高峰时段定期收集，能躲掉很多"计划突然变差"。

## 我们最后做了什么

按投入产出排，就四件事。改写 SQL，把日期条件从函数包裹改成范围查询，覆盖几个最重的查询。补组合索引，按实际过滤条件建 `(机构, 期间, 指标)` 这种，区分度高的列放前面。存储过程批量化，循环体改分批提交。统计信息常态化，塞进调度里，批处理前做一次增量收集。

改完耗时明显下来了，考核结果从"下午等"变成"上午就能拿到"。对一个每月都要出数的系统来说，这个差别客户是能直接感觉到的。

## 几个坑

别在生产高峰验证优化效果，我一般选同一时段、同样数据量做对比，否则数字没意义。一次只改一处，同时改五个地方，跑快了也不知道是哪一处起的作用。优化前后各存一份执行计划和耗时，留个基线，出问题能对照。还有，索引不是越多越好，索引会拖慢写入，批处理场景要权衡。

## 顺序比方案重要

下次再遇到，我还是按这个顺序走：会话在等什么、哪条 SQL 最重、计划里有没有全表扫描和隐式转换、统计信息新不新、提交频率高不高、有没有能拆的串行步骤，最后才考虑扩容。

从定位开始，比从扩容开始，省钱也省时间。
