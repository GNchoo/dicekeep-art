"""캐시 없이 파일을 제공하는 개발용 로컬 서버 (start.bat에서 사용)"""
import os
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get('PORT', '8137'))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


class DualStackServer(ThreadingHTTPServer):
    """IPv4 + IPv6 동시 수신 (localhost가 ::1로 풀려도 접속되도록)"""
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == '__main__':
    try:
        httpd = DualStackServer(('::', PORT), NoCacheHandler)
    except OSError:
        httpd = ThreadingHTTPServer(('0.0.0.0', PORT), NoCacheHandler)
    print(f'주사위 성채 서버 실행 중: http://localhost:{PORT}')
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
