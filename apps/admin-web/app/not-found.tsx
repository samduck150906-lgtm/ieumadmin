import Link from 'next/link';

/**
 * 404 페이지 — 서버 컴포넌트 (prerender 시 React error #31 방지).
 * 객체 대신 문자열/JSX만 렌더링하여 "Objects are not valid as a React child" 회피.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md w-full text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">페이지를 찾을 수 없습니다</h2>
        <p className="text-gray-500 mb-6">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
