FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# 仅拷贝纯静态资源
COPY index.html ./index.html
COPY admin.html ./admin.html
COPY student.html ./student.html
COPY css ./css
COPY js ./js

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
