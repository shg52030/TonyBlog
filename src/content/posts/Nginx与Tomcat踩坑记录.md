---
author: "Tony"
pubDatetime: 2025-06-18T13:47:00+08:00
title: "上线后关于Nginx 的事"
featured: false
draft: false
tags:
  - Nginx
  - Tomcat
  - 运维
description: "413、504、真实 IP 没了、静态资源 404。这几个我几乎每个项目都要碰一次。"


---

常见的部署组合：Nginx 在前面扛静态资源和反向代理，Tomcat 在后面跑应用。

这个组合挺稳，但刚上线那几天出的问题，基本都集中在两者中间那层配置上。时间久了就有数了，哪几个坑一定会来。

## 传大文件报 413

现象很直接，小文件能传，大一点就失败。Nginx 日志里是 `client intended to send too large body`。

```nginx
server {
    client_max_body_size 200m;

    location /upload {
        client_body_buffer_size 1m;
        client_body_timeout 300s;
        proxy_pass http://app_backend;
        proxy_read_timeout 300s;
    }
}
```

Tomcat 那边也要看一眼：

```xml
<Connector port="8080" protocol="HTTP/1.1"
           maxPostSize="-1"
           maxSwallowSize="-1" />
```

`maxSwallowSize` 这个参数挺关键。请求体被拒的时候，Tomcat 得把它读完才能复用连接，否则客户端看到的是连接被重置，而不是一个明确的错误，排查的时候容易被误导。

大文件还是走分片上传比较稳，别指望调大阈值就没事。

## 接口跑久了 504

报表导出、批量计算这种接口跑几分钟很正常，Nginx 默认超时太短，会先在网关层断掉。

```nginx
location /api/ {
    proxy_pass http://app_backend;
    proxy_connect_timeout 10s;
    proxy_send_timeout    600s;
    proxy_read_timeout    600s;
}
```

三层超时要一起改：Nginx 的 `proxy_read_timeout`、Tomcat 的连接超时、应用内部 HTTP 客户端的超时。少改一层都不行。

我遇到过一次只改了 Nginx，结果应用侧自己先断了，日志里是读超时，看着像网络问题，其实是代码里那个客户端设了短超时。

## 日志里全是 127.0.0.1

做审计或者限流的时候发现拿不到真实 IP。反向代理以后 `remote_addr` 变成代理地址了。

```nginx
location / {
    proxy_pass http://app_backend;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

应用侧也得显式信任这个头，Tomcat 是这么配的：

```xml
<Valve className="org.apache.catalina.valves.RemoteIpValve"
       remoteIpHeader="x-forwarded-for"
       protocolHeader="x-forwarded-proto" />
```

不过要留个心，只有确认请求一定经过可信代理才能信任 `X-Forwarded-For`，否则这个头是可以伪造的。

## 刷新页面 404

前后端分离常见，Nginx 指向前端打包目录，路由用了 history 模式，刷新就 404。

```nginx
location / {
    root  /opt/web/dist;
    index index.html;
    try_files $uri $uri/ /index.html;
}

location /assets/ {
    root      /opt/web/dist;
    expires   30d;
    add_header Cache-Control "public, immutable";
}

location = /index.html {
    add_header Cache-Control "no-store, no-cache, must-revalidate";
}
```

带 hash 的静态资源可以长缓存，`index.html` 一定要禁缓存，不然发版以后用户看到的还是旧页面，然后来找你说"改了没生效"。

## 后端重启就 502

发布的时候后端停几秒，前端就报错。要做到无感，至少得三样：后端有健康检查接口、upstream 配多节点能重试、后端优雅停机先摘流量再退出。

```nginx
upstream app_backend {
    server 10.0.0.11:8080 max_fails=3 fail_timeout=10s;
    server 10.0.0.12:8080 max_fails=3 fail_timeout=10s;
    keepalive 32;
}
```

单机部署做不到零中断，但能把窗口压得很短，另外提前告诉客户一声，比什么都强。

## 出问题我先看哪

浏览器 Network 面板看状态码、响应头和耗时分布。然后 Nginx 的 `access.log`，看状态码和 `$upstream_response_time`。配置用 `nginx -t` 验，`-T` 打印实际生效的。再往下是 `catalina.out` 和应用日志，按 traceId 串。最后才看系统层，`ss -lntp`、`top`、`df -h`。

两条常用的：

```bash
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn
awk '{print $NF, $7}' /var/log/nginx/access.log | sort -rn | head -20
```

配置本身不难，难的是知道哪一层会先出问题。所以我现在部署完先把这几个坑对应的配置全写上，不等它出。
