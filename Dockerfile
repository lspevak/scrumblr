FROM rockylinux:9

# To build:
# docker build . -t scrumblr-img

# To run in container:
# useradd -u 1000 -g games scrumblr
# mkdir -p /scrumblr
# chown -R scrumblr:games /scrumblr
# docker run -v /scrumblr:/var/lib/redis -u scrumblr -p 8080:8080 scrumblr-img

RUN curl -sL https://rpm.nodesource.com/setup_12.x | bash - \
    && dnf install -y nodejs redis git

# Install application
RUN cd /opt \
    && git clone https://github.com/lspevak/scrumblr \
    && cd /opt/scrumblr \
    && npm install

COPY docker_entrypoint.sh /docker_entrypoint.sh

RUN useradd -u 1000 -g games scrumblr \
    && chown scrumblr:games /docker_entrypoint.sh \
    && chmod +x /docker_entrypoint.sh \
    && chown -R scrumblr:games /opt/scrumblr \
    && chown -R scrumblr:games /var/lib/redis \
    && chown -R scrumblr:games /etc/redis \
    && chown -R scrumblr:games /var/log/redis

EXPOSE 8080

CMD ["/docker_entrypoint.sh"]
