export default function RootLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"
          aria-hidden
        />
        <p className="text-gray-500">로딩 중...</p>
      </div>
    </div>
  );
}
