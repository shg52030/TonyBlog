---
author: "Tony"
pubDatetime: 2024-11-07T21:58:00+08:00
title: "Vue 和 Spring Boot 联调遇到的问题"
featured: false
draft: false
tags:
  - Vue
  - Spring Boot
  - 前后端
description: "跨域、Long 丢精度、下载乱码、数组传不过去。"
---



## 跨域只在联调环境有

现象是前端本地 `localhost:5173`，后端 `localhost:8080`，端口不一样就算跨域。部署到 Nginx 后面又好了，因为同源了。

我现在的做法是开发环境用代理，不碰后端配置：

```javascript
// vite.config.js
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

前端请求统一写 `/api/xxx`，生产由 Nginx 转发。前后端都不用改代码，问题在网关层解决，最干净。

非要后端配的话：

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
```

这里有个坑，用了 `allowCredentials(true)` 就不能写 `allowedOrigins("*")`，必须用 `allowedOriginPatterns`，否则服务启动直接报错，报错信息还挺绕。

## 下载下来文件名是乱码

下载的文件叫 `ä¸æ–‡.xlsx`。

响应头里的中文文件名没编码：

```java
@GetMapping("/export")
public void export(HttpServletResponse response) throws IOException {
    String fileName = "考核结果.xlsx";
    String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8)
            .replaceAll("\\+", "%20");

    response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition",
            "attachment; filename=\"" + encoded + "\"; filename*=UTF-8''" + encoded);

    // 写响应流
}
```

前端记得 `responseType: 'blob'`，不然文件内容也会被当文本处理：

```javascript
const res = await axios.get('/api/export', { responseType: 'blob' })
const url = window.URL.createObjectURL(new Blob([res.data]))
```

还有个隐藏的，Nginx 如果开着 gzip 又作用到下载接口，文件可能坏。大文件下载路径单独把压缩关掉。

## 数组参数传不过去

前端传 `ids: [1,2,3]`，后端 `@RequestParam List<Long> ids` 收不到。

GET 用逗号拼，Spring 默认能解析：

```javascript
axios.get('/api/users', { params: { ids: ids.join(',') } })
```

POST 加 `@RequestBody` 的话，前端要确保 `Content-Type: application/json`，别把对象塞 `params` 里。

最容易出错的是混着用，有人把对象放 `params` 传，浏览器序列化成 `[object Object]`，后端一脸茫然。所以我坚持在接口文档里写清楚用 body 还是 query。

## 我现在的习惯

联调时先不看代码，先把这六件事定下来：接口前缀统一 `/api`，开发走代理；ID 全部字符串；时间格式 `yyyy-MM-dd HH:mm:ss`，时区东八区；响应结构 `{ code, message, data }`；业务错误码统一，前端能按码提示；分页参数固定叫 `pageNum`、`pageSize`。

六条定完，后面大部分低级问题不会发生。

联调慢往往不是技术难，是约定不清。与其一遍遍解释为什么这个字段是字符串，不如开场就把规则贴到文档里，谁也别问第二遍。
