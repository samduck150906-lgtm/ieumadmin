'use client';

import { useState, useEffect } from 'react';
import { MapPin, Search, X } from 'lucide-react';

interface AddressSearchProps {
  value: string;
  onChange: (address: string, extraData?: AddressData) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
}

interface AddressData {
  zonecode: string; // 우편번호
  address: string; // 기본주소
  addressType: 'R' | 'J'; // R: 도로명, J: 지번
  bname: string; // 법정동/법정리
  buildingName: string; // 건물명
  apartment: 'Y' | 'N'; // 아파트 여부
  sido: string; // 시도
  sigungu: string; // 시군구
  roadAddress: string; // 도로명주소
  jibunAddress: string; // 지번주소
}

declare global {
  interface Window {
    daum: {
      Postcode: new (options: {
        oncomplete: (data: AddressData) => void;
        onclose?: () => void;
        width?: string;
        height?: string;
      }) => {
        open: () => void;
        embed: (element: HTMLElement) => void;
      };
    };
  }
}

export default function AddressSearch({
  value,
  onChange,
  placeholder = '주소를 검색하세요',
  label,
  required = false,
}: AddressSearchProps) {
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [detailAddress, setDetailAddress] = useState('');

  // 다음 주소 API 스크립트 로드
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.daum) {
      const script = document.createElement('script');
      script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.async = true;
      script.onload = () => setIsScriptLoaded(true);
      document.head.appendChild(script);
    } else if (window.daum) {
      setIsScriptLoaded(true);
    }
  }, []);

  const handleSearch = () => {
    if (!isScriptLoaded || !window.daum) {
      alert('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    new window.daum.Postcode({
      oncomplete: (data: AddressData) => {
        // 도로명 주소 우선, 없으면 지번 주소
        const fullAddress = data.roadAddress || data.jibunAddress;
        onChange(fullAddress, data);
        setDetailAddress('');
      },
      width: '100%',
      height: '100%',
    }).open();
  };

  const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const detail = e.target.value;
    setDetailAddress(detail);
    
    // 기본주소 + 상세주소 합쳐서 전달
    if (value) {
      const baseAddress = value.split(' (')[0]; // 상세주소 제외한 기본주소
      onChange(detail ? `${baseAddress} ${detail}` : baseAddress);
    }
  };

  const handleClear = () => {
    onChange('');
    setDetailAddress('');
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div className="space-y-2">
        {/* 주소 검색 */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <MapPin className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={value}
            readOnly
            placeholder={placeholder}
            className="w-full pl-10 pr-20 py-3 border border-gray-300 rounded-xl bg-gray-50 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onClick={handleSearch}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {value && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleClear(); }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleSearch}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 상세 주소 */}
        {value && (
          <input
            type="text"
            value={detailAddress}
            onChange={handleDetailChange}
            placeholder="상세주소 입력 (동/호수)"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        )}
      </div>
    </div>
  );
}

// 간단 버전 (버튼만)
export function AddressSearchButton({
  onSelect,
  className = '',
}: {
  onSelect: (address: string, data: AddressData) => void;
  className?: string;
}) {
  const handleClick = () => {
    if (typeof window === 'undefined' || !window.daum) {
      // 스크립트 로드
      const script = document.createElement('script');
      script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.onload = () => openPostcode();
      document.head.appendChild(script);
    } else {
      openPostcode();
    }
  };

  const openPostcode = () => {
    new window.daum.Postcode({
      oncomplete: (data: AddressData) => {
        const address = data.roadAddress || data.jibunAddress;
        onSelect(address, data);
      },
    }).open();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 ${className}`}
    >
      <Search className="w-4 h-4" />
      주소 검색
    </button>
  );
}
