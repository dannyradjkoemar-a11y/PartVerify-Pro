import React from 'react';

interface AeModuleLogoProps {
  className?: string;
  alt?: string;
}

export const AeModuleLogo: React.FC<AeModuleLogoProps> = ({ 
  className = "h-11 w-auto", 
  alt = "AE MODULE - AUDATEX / AZT" 
}) => {
  return (
    <img 
      src="/assets/aistudio/image_70c0586f.png" 
      alt={alt} 
      className={`${className} object-contain rounded-xl select-none`} 
      draggable={false}
    />
  );
};

export default AeModuleLogo;
