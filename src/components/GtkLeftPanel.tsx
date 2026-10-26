import React, { useState } from 'react';
import { CPUState, Flags } from '../types/8085';
import { Info, RotateCw, AlignLeft } from 'lucide-react';

interface GtkLeftPanelProps {
  cpuState: CPUState;
  onUpdateReg: (reg: any, val: number) => void;
  onUpdatePC: (pc: number) => void;
  onUpdateSP: (sp: number) => void;
  onToggleFlag: (flag: keyof Flags) => void;
  onWritePort: (port: number, val: number) => void;
  readPort: (port: number) => number;
  onWriteMemory: (addr: number, val: number) => void;
  readMemory: (addr: number) => number;
  focusedMemoryAddress?: number | null;
  memoryVersion?: number;
}

export const GtkLeftPanel: React.FC<GtkLeftPanelProps> = ({
  cpuState,
  onUpdateReg,
  onUpdatePC,
  onUpdateSP,
  onToggleFlag,
  onWritePort,
  readPort,
  onWriteMemory,
  readMemory,
  focusedMemoryAddress,
  memoryVersion,
}) => {
  // Decimal - Hex conversion state
  const [decInput, setDecInput] = useState<string>('0');
  const [hexInput, setHexInput] = useState<string>('0');

  // I/O Port update state
  const [portAddrStr, setPortAddrStr] = useState<string>('00');
  const [portVal, setPortVal] = useState<string>('00');

  // Memory update state (defaults to 4200h)
  const [memAddrStr, setMemAddrStr] = useState<string>('4200');
  const [memVal, setMemVal] = useState<string>('00');

  const toHex2 = (n: number) => (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
  const toHex4 = (n: number) => (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');

  const getPortAddr = (): number => {
    const clean = portAddrStr.trim().replace(/h$/i, '');
    const n = parseInt(clean, 16);
    return isNaN(n) ? 0 : Math.max(0, Math.min(255, n));
  };

  const getMemAddr = (): number => {
    const clean = memAddrStr.trim().replace(/h$/i, '');
    const n = parseInt(clean, 16);
    return isNaN(n) ? 0x4200 : Math.max(0, Math.min(0xffff, n));
  };

  // Only auto-jump when focusedMemoryAddress changes to a NEW address from code execution
  const lastFocusedRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (focusedMemoryAddress !== undefined && focusedMemoryAddress !== null && focusedMemoryAddress !== lastFocusedRef.current) {
      lastFocusedRef.current = focusedMemoryAddress;
      setMemAddrStr(toHex4(focusedMemoryAddress));
      setMemVal(toHex2(readMemory(focusedMemoryAddress)));
    }
  }, [focusedMemoryAddress, readMemory]);

  // When memory data updates, refresh the displayed byte at the current address
  React.useEffect(() => {
    const a = getMemAddr();
    setMemVal(toHex2(readMemory(a)));
  }, [memoryVersion, readMemory]);

  React.useEffect(() => {
    const p = getPortAddr();
    setPortVal(toHex2(readPort(p)));
  }, [readPort, cpuState]);


  // Hex conversion handlers
  const handleToHex = () => {
    const d = parseInt(decInput, 10);
    if (!isNaN(d)) {
      setHexInput((d & 0xffff).toString(16).toUpperCase());
    }
  };

  const handleToDec = () => {
    const h = parseInt(hexInput.replace(/h$/i, ''), 16);
    if (!isNaN(h)) {
      setDecInput(h.toString(10));
    }
  };

  // Port update handlers
  const handlePortAddrChange = (delta: number) => {
    const current = getPortAddr();
    const next = Math.max(0, Math.min(255, current + delta));
    setPortAddrStr(toHex2(next));
    setPortVal(toHex2(readPort(next)));
  };

  const handleApplyPortUpdate = () => {
    const p = getPortAddr();
    const val = parseInt(portVal.replace(/h$/i, ''), 16);
    if (!isNaN(val)) {
      onWritePort(p, val & 0xff);
    }
  };

  // Memory update handlers
  const handleMemAddrChange = (delta: number) => {
    const current = getMemAddr();
    const next = Math.max(0, Math.min(0xffff, current + delta));
    setMemAddrStr(toHex4(next));
    setMemVal(toHex2(readMemory(next)));
  };

  const handleApplyMemUpdate = () => {
    const a = getMemAddr();
    const val = parseInt(memVal.replace(/h$/i, ''), 16);
    if (!isNaN(val)) {
      onWriteMemory(a, val & 0xff);
    }
  };

  // PSW calculation (A in high byte, Flags in low byte)
  let pswFlags = 0x02;
  if (cpuState.flags.sign) pswFlags |= 0x80;
  if (cpuState.flags.zero) pswFlags |= 0x40;
  if (cpuState.flags.auxCarry) pswFlags |= 0x10;
  if (cpuState.flags.parity) pswFlags |= 0x04;
  if (cpuState.flags.carry) pswFlags |= 0x01;

  return (
    <div className="w-56 bg-[#edece8] border-r border-[#c2c0ba] p-2 flex flex-col gap-2 overflow-y-auto select-none text-xs text-[#2e3436]">
      {/* 1. Registers & Flag Side-by-Side Fieldsets (Exact GNUSim8085 Layout) */}
      <div className="flex gap-1.5">
        {/* Registers Fieldset */}
        <fieldset className="gtk-group flex-1">
          <legend>Registers</legend>
          <div className="font-mono text-xs space-y-1 pt-0.5">
            {/* A */}
            <div className="flex items-center justify-between">
              <span className="italic font-serif text-[#1e293b]">A</span>
              <span className="font-semibold text-right tabular-nums">{toHex2(cpuState.A)}</span>
            </div>

            {/* BC */}
            <div className="flex items-center justify-between">
              <span className="italic font-serif text-[#1e293b]">BC</span>
              <div className="flex gap-2 tabular-nums">
                <span className="font-semibold">{toHex2(cpuState.B)}</span>
                <span className="font-semibold">{toHex2(cpuState.C)}</span>
              </div>
            </div>

            {/* DE */}
            <div className="flex items-center justify-between">
              <span className="italic font-serif text-[#1e293b]">DE</span>
              <div className="flex gap-2 tabular-nums">
                <span className="font-semibold">{toHex2(cpuState.D)}</span>
                <span className="font-semibold">{toHex2(cpuState.E)}</span>
              </div>
            </div>

            {/* HL */}
            <div className="flex items-center justify-between">
              <span className="italic font-serif text-[#1e293b]">HL</span>
              <div className="flex gap-2 tabular-nums">
                <span className="font-semibold">{toHex2(cpuState.H)}</span>
                <span className="font-semibold">{toHex2(cpuState.L)}</span>
              </div>
            </div>

            {/* PSW */}
            <div className="flex items-center justify-between">
              <span className="italic font-serif text-[#1e293b]">PSW</span>
              <div className="flex gap-2 tabular-nums">
                <span className="font-semibold">{toHex2(cpuState.A)}</span>
                <span className="font-semibold">{toHex2(pswFlags)}</span>
              </div>
            </div>

            {/* PC */}
            <div className="flex items-center justify-between">
              <span className="italic font-serif text-[#1e293b]">PC</span>
              <div className="flex gap-2 tabular-nums">
                <span className="font-semibold">{toHex2((cpuState.PC >> 8) & 0xff)}</span>
                <span className="font-semibold">{toHex2(cpuState.PC & 0xff)}</span>
              </div>
            </div>

            {/* SP */}
            <div className="flex items-center justify-between">
              <span className="italic font-serif text-[#1e293b]">SP</span>
              <div className="flex gap-2 tabular-nums">
                <span className="font-semibold">{toHex2((cpuState.SP >> 8) & 0xff)}</span>
                <span className="font-semibold">{toHex2(cpuState.SP & 0xff)}</span>
              </div>
            </div>

            {/* Int-Reg */}
            <div className="flex items-center justify-between text-[11px] text-[#555] pt-0.5 border-t border-[#e2e0da]">
              <span>Int-Reg</span>
              <span className="font-semibold font-mono text-[#2e3436]">00</span>
            </div>
          </div>
        </fieldset>

        {/* Flag Fieldset */}
        <fieldset className="gtk-group w-14 shrink-0">
          <legend>Flag</legend>
          <div className="font-mono text-xs space-y-1 pt-0.5">
            <div
              onClick={() => onToggleFlag('sign')}
              className="flex items-center justify-between cursor-pointer hover:bg-slate-200/60 px-0.5 rounded"
              title="Click to toggle Sign flag"
            >
              <span className="italic font-serif">S</span>
              <span className="font-semibold">{cpuState.flags.sign ? '1' : '0'}</span>
            </div>

            <div
              onClick={() => onToggleFlag('zero')}
              className="flex items-center justify-between cursor-pointer hover:bg-slate-200/60 px-0.5 rounded"
              title="Click to toggle Zero flag"
            >
              <span className="italic font-serif">Z</span>
              <span className="font-semibold">{cpuState.flags.zero ? '1' : '0'}</span>
            </div>

            <div
              onClick={() => onToggleFlag('auxCarry')}
              className="flex items-center justify-between cursor-pointer hover:bg-slate-200/60 px-0.5 rounded"
              title="Click to toggle Aux Carry flag"
            >
              <span className="italic font-serif text-[11px]">AC</span>
              <span className="font-semibold">{cpuState.flags.auxCarry ? '1' : '0'}</span>
            </div>

            <div
              onClick={() => onToggleFlag('parity')}
              className="flex items-center justify-between cursor-pointer hover:bg-slate-200/60 px-0.5 rounded"
              title="Click to toggle Parity flag"
            >
              <span className="italic font-serif">P</span>
              <span className="font-semibold">{cpuState.flags.parity ? '1' : '0'}</span>
            </div>

            <div
              onClick={() => onToggleFlag('carry')}
              className="flex items-center justify-between cursor-pointer hover:bg-slate-200/60 px-0.5 rounded"
              title="Click to toggle Carry flag"
            >
              <span className="italic font-serif">C</span>
              <span className="font-semibold">{cpuState.flags.carry ? '1' : '0'}</span>
            </div>
          </div>
        </fieldset>
      </div>

      {/* 2. Decimal - Hex Conversion Group */}
      <fieldset className="gtk-group">
        <legend className="flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-[#3465a4] fill-[#729fcf]/30 inline" />
          <span>Decimal - Hex Conversion</span>
        </legend>

        <div className="space-y-1.5 pt-1">
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-[10px] text-slate-600 mb-0.5">Decimal</div>
              <input
                type="text"
                value={decInput}
                onChange={(e) => setDecInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleToHex()}
                className="w-full bg-white border border-[#b8b6b0] px-1.5 py-0.5 text-xs font-mono outline-none rounded-xs"
              />
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-slate-600 mb-0.5">Hex</div>
              <input
                type="text"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleToDec()}
                className="w-full bg-white border border-[#b8b6b0] px-1.5 py-0.5 text-xs font-mono outline-none rounded-xs uppercase"
              />
            </div>
          </div>

          <div className="flex gap-1.5 pt-0.5">
            <button
              onClick={handleToHex}
              className="gtk-btn flex-1 py-1 text-[11px] font-sans text-slate-700 flex items-center justify-center gap-1"
            >
              <span className="text-[#e95420] font-bold">»</span> To Hex
            </button>
            <button
              onClick={handleToDec}
              className="gtk-btn flex-1 py-1 text-[11px] font-sans text-slate-700 flex items-center justify-center gap-1"
            >
              <span className="text-[#e95420] font-bold">«</span> To Dec
            </button>
          </div>
        </div>
      </fieldset>

      {/* 3. I/O Ports Group */}
      <fieldset className="gtk-group">
        <legend className="flex items-center gap-1">
          <AlignLeft className="w-3 h-3 text-slate-700 inline" />
          <span>I/O Ports</span>
        </legend>

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={portAddrStr}
              onChange={(e) => {
                const s = e.target.value;
                setPortAddrStr(s);
                const n = parseInt(s.replace(/h$/i, ''), 16);
                if (!isNaN(n)) {
                  setPortVal(toHex2(readPort(n & 0xff)));
                }
              }}
              className="w-10 bg-white border border-[#b8b6b0] px-1 py-0.5 text-xs font-mono text-center outline-none rounded-xs uppercase font-semibold"
            />
            <button
              onClick={() => handlePortAddrChange(-1)}
              className="gtk-btn px-1.5 py-0.5 text-xs font-bold"
              title="Previous Port"
            >
              -
            </button>
            <button
              onClick={() => handlePortAddrChange(1)}
              className="gtk-btn px-1.5 py-0.5 text-xs font-bold"
              title="Next Port"
            >
              +
            </button>
            <input
              type="text"
              value={portVal}
              onChange={(e) => setPortVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyPortUpdate()}
              className="flex-1 bg-white border border-[#b8b6b0] px-1.5 py-0.5 text-xs font-mono text-center outline-none rounded-xs uppercase font-semibold"
            />
          </div>

          <button
            onClick={handleApplyPortUpdate}
            className="gtk-btn w-full py-1 text-[11px] text-slate-700 flex items-center justify-center gap-1"
          >
            <RotateCw className="w-3 h-3 text-[#3465a4]" />
            <span>Update Port Value</span>
          </button>
        </div>
      </fieldset>

      {/* 4. Memory Group */}
      <fieldset className="gtk-group">
        <legend className="flex items-center gap-1">
          <AlignLeft className="w-3 h-3 text-slate-700 inline" />
          <span>Memory</span>
        </legend>

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={memAddrStr}
              onChange={(e) => {
                const s = e.target.value;
                setMemAddrStr(s);
                const n = parseInt(s.replace(/h$/i, ''), 16);
                if (!isNaN(n)) {
                  setMemVal(toHex2(readMemory(n & 0xffff)));
                }
              }}
              className="w-14 bg-white border border-[#b8b6b0] px-1 py-0.5 text-xs font-mono text-center outline-none rounded-xs uppercase font-semibold"
            />
            <button
              onClick={() => handleMemAddrChange(-1)}
              className="gtk-btn px-1.5 py-0.5 text-xs font-bold"
              title="Previous Byte"
            >
              -
            </button>
            <button
              onClick={() => handleMemAddrChange(1)}
              className="gtk-btn px-1.5 py-0.5 text-xs font-bold"
              title="Next Byte"
            >
              +
            </button>
            <input
              type="text"
              value={memVal}
              onChange={(e) => setMemVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyMemUpdate()}
              className="flex-1 bg-white border border-[#b8b6b0] px-1.5 py-0.5 text-xs font-mono text-center outline-none rounded-xs uppercase font-semibold"
            />
          </div>

          <button
            onClick={handleApplyMemUpdate}
            className="gtk-btn w-full py-1 text-[11px] text-slate-700 flex items-center justify-center gap-1"
          >
            <RotateCw className="w-3 h-3 text-[#3465a4]" />
            <span>Update Memory</span>
          </button>
        </div>
      </fieldset>
    </div>
  );
};
