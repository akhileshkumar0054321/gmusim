import React, { useState, useEffect } from 'react';
import { SymbolEntry } from '../types/8085';

interface GtkRightPanelProps {
  symbols: Record<string, SymbolEntry>;
  targetMemoryAddresses?: number[];
  recentWrites?: { address: number; value: number; pc: number }[];
  modifiedAddresses?: Set<number>;
  memory: Uint8Array;
  sp: number;
  ioPorts: Uint8Array;
  onWritePort: (port: number, val: number) => void;
  onWriteMemory: (addr: number, val: number) => void;
  assemblerMessages: { line: number; message: string; type?: 'info' | 'error' | 'success' }[];
  onInsertInstruction: (text: string) => void;
  focusedMemoryAddress?: number | null;
  memoryVersion?: number;
}

// Authentic GNUSim8085 Dual Gear Icon (matching screenshot)
const DualGearsIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    {/* Left gear */}
    <path
      d="M5.5 1.5a.6.6 0 00-.5.3l-.3.7a3 3 0 00-.7.4l-.7-.3a.6.6 0 00-.7.3L2.2 4a.6.6 0 00.1.7l.6.5a3 3 0 000 .8l-.6.5a.6.6 0 00-.1.7l.4 1.1a.6.6 0 00.7.3l.7-.3a3 3 0 00.7.4l.3.7a.6.6 0 00.5.3h1.2a.6.6 0 00.5-.3l.3-.7a3 3 0 00.7-.4l.7.3a.6.6 0 00.7-.3l.4-1.1a.6.6 0 00-.1-.7l-.6-.5a3 3 0 000-.8l.6-.5a.6.6 0 00.1-.7L9 2.9a.6.6 0 00-.7-.3l-.7.3a3 3 0 00-.7-.4l-.3-.7a.6.6 0 00-.5-.3H5.5zm.6 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"
      opacity="0.85"
    />
    {/* Right gear */}
    <path d="M11 6.5a.5.5 0 00-.4.3l-.2.6a2.5 2.5 0 00-.6.3l-.6-.2a.5.5 0 00-.6.2l-.4.8a.5.5 0 00.1.6l.5.4a2.5 2.5 0 000 .6l-.5.4a.5.5 0 00-.1.6l.4.8a.5.5 0 00.6.2l.6-.2a2.5 2.5 0 00.6.3l.2.6a.5.5 0 00.4.3h.9a.5.5 0 00.4-.3l.2-.6a2.5 2.5 0 00.6-.3l.6.2a.5.5 0 00.6-.2l.4-.8a.5.5 0 00-.1-.6l-.5-.4a2.5 2.5 0 000-.6l.5-.4a.5.5 0 00.1-.6l-.4-.8a.5.5 0 00-.6-.2l-.6.2a2.5 2.5 0 00-.6-.3l-.2-.6a.5.5 0 00-.4-.3H11zm.45 2.2a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" />
  </svg>
);

// Authentic GNUSim8085 KeyPad Badge Icon [Abc]
const KeyPadIcon: React.FC = () => (
  <span className="inline-flex items-center justify-center px-0.5 py-[0.5px] border border-[#d97706] rounded-[2px] bg-[#fffbeb] text-[8px] font-bold text-[#b45309] leading-none tracking-tighter">
    Abc
  </span>
);

export const GtkRightPanel: React.FC<GtkRightPanelProps> = ({
  symbols,
  targetMemoryAddresses = [],
  recentWrites = [],
  modifiedAddresses,
  memory,
  sp,
  ioPorts,
  onWritePort,
  onWriteMemory,
  assemblerMessages,
  onInsertInstruction,
  focusedMemoryAddress,
  memoryVersion = 0,
}) => {
  const [activeTab, setActiveTab] = useState<'data' | 'stack' | 'keypad' | 'memory' | 'io'>('data');

  // Keypad selected item
  const [selectedMnemonic, setSelectedMnemonic] = useState<string>('MOV');
  const [arg1, setArg1] = useState<string>('A');

  // Memory view state: offset, input, view mode ('table' list vs 'grid' matrix), page size
  const [memOffset, setMemOffset] = useState<number>(0x2000);
  const [memJumpInput, setMemJumpInput] = useState<string>('2000');
  const [memoryViewMode, setMemoryViewMode] = useState<'table' | 'grid'>('table');
  const [pageSize, setPageSize] = useState<number>(100);

  // Custom user watched addresses in Data tab
  const [customWatchAddresses, setCustomWatchAddresses] = useState<number[]>([]);
  const [watchInput, setWatchInput] = useState<string>('');

  // Auto-jump memory viewer when target memory is written
  useEffect(() => {
    if (focusedMemoryAddress !== undefined && focusedMemoryAddress !== null) {
      setMemOffset(focusedMemoryAddress);
      setMemJumpInput(focusedMemoryAddress.toString(16).toUpperCase());
    }
  }, [focusedMemoryAddress]);

  // Handle adding custom watch address in Data tab
  const handleAddWatch = (addrToAdd?: number) => {
    let addr = addrToAdd;
    if (addr === undefined) {
      const clean = watchInput.trim().replace(/h$/i, '');
      addr = parseInt(clean, 16);
    }
    if (addr !== undefined && !isNaN(addr) && addr >= 0 && addr <= 0xffff) {
      if (!customWatchAddresses.includes(addr)) {
        setCustomWatchAddresses((prev) => [...prev, addr]);
      }
      setWatchInput('');
    }
  };

  // Jump to specific address in Memory Tab
  const handleJumpToMemory = (addr: number) => {
    const clamped = Math.max(0, Math.min(0xffff, addr));
    setMemOffset(clamped);
    setMemJumpInput(clamped.toString(16).toUpperCase());
  };

  const handleApplyJump = () => {
    const clean = memJumpInput.trim().replace(/h$/i, '');
    const addr = parseInt(clean, 16);
    if (!isNaN(addr)) {
      handleJumpToMemory(addr);
    }
  };

  // Compile full Data entries: declared symbols, target memory destinations (STA 2050H, etc.), execution writes, non-zero memory, and user watches
  interface DataRow {
    addressNum: number;
    address: string;
    variable: string;
    value: string;
    decimal: string;
    isTarget: boolean;
  }

  const addressMap = new Map<number, { name: string; isTarget?: boolean }>();

  // 1. Data symbols (DB, DW, DS, EQU, or labels)
  for (const sym of Object.values(symbols)) {
    addressMap.set(sym.address, {
      name: sym.name,
      isTarget: sym.address === focusedMemoryAddress,
    });
  }

  // 2. Target memory addresses from code (e.g. STA 2050H, SHLD 2050H, LXI H, 2050H, LDA 2050H)
  for (const addr of targetMemoryAddresses) {
    if (!addressMap.has(addr)) {
      addressMap.set(addr, {
        name: `${addr.toString(16).toUpperCase().padStart(4, '0')}H`,
        isTarget: addr === focusedMemoryAddress,
      });
    }
  }

  // 3. Memory addresses written during execution (STA, MOV M, r, etc.)
  for (const w of recentWrites) {
    const existing = addressMap.get(w.address);
    addressMap.set(w.address, {
      name: existing ? existing.name : `${w.address.toString(16).toUpperCase().padStart(4, '0')}H`,
      isTarget: true,
    });
  }

  // 4. Any modified memory address that holds data
  if (modifiedAddresses) {
    for (const addr of modifiedAddresses) {
      if (!addressMap.has(addr) && memory[addr] !== 0) {
        addressMap.set(addr, {
          name: `${addr.toString(16).toUpperCase().padStart(4, '0')}H`,
          isTarget: addr === focusedMemoryAddress,
        });
      }
    }
  }

  // 5. Any custom watched addresses
  for (const addr of customWatchAddresses) {
    if (!addressMap.has(addr)) {
      addressMap.set(addr, {
        name: `Watch [${addr.toString(16).toUpperCase().padStart(4, '0')}H]`,
        isTarget: addr === focusedMemoryAddress,
      });
    }
  }

  // Convert map to sorted data rows
  const sortedAddrs = Array.from(addressMap.keys()).sort((a, b) => a - b);
  const dataRows: DataRow[] = sortedAddrs.map((addr) => {
    const info = addressMap.get(addr)!;
    const val = memory[addr] || 0;
    const isTarget = addr === focusedMemoryAddress;

    return {
      addressNum: addr,
      address: addr.toString(16).toUpperCase().padStart(4, '0') + 'h',
      variable: info.name,
      value: val.toString(16).toUpperCase().padStart(2, '0') + 'h',
      decimal: val.toString(10),
      isTarget,
    };
  });

  // Stack entries
  const stackEntries: { address: string; value: string; isSP: boolean }[] = [];
  const startAddr = Math.min(0xffff, sp + 12);
  const endAddr = Math.max(0, sp - 4);
  for (let a = startAddr; a >= endAddr; a--) {
    stackEntries.push({
      address: a.toString(16).toUpperCase().padStart(4, '0') + 'h',
      value: (memory[a] || 0).toString(16).toUpperCase().padStart(2, '0') + 'h',
      isSP: a === sp,
    });
  }

  return (
    <div className="w-80 md:w-96 flex flex-col h-full bg-[#edece8] select-none text-xs border-l border-[#c2c0ba] overflow-hidden">
      {/* Top Tabs (Exact GNUSim8085 Layout from user screenshot) */}
      <div className="flex bg-[#edece8] border-b border-[#d5d3cc] text-[12px] font-sans px-2 pt-1.5 gap-1 items-end">
        {/* Data Tab */}
        <button
          onClick={() => setActiveTab('data')}
          className={`px-3 py-1 rounded-t-[4px] border-t border-x flex items-center gap-1.5 transition-colors ${
            activeTab === 'data'
              ? 'bg-white border-[#d5d3cc] text-[#2e3436] font-semibold border-b-transparent -mb-[1px] z-10 shadow-2xs'
              : 'bg-transparent border-transparent text-[#555] hover:text-[#222]'
          }`}
        >
          <DualGearsIcon className="w-3.5 h-3.5 text-[#555753]" />
          <span>Data</span>
        </button>

        {/* Stack Tab */}
        <button
          onClick={() => setActiveTab('stack')}
          className={`px-3 py-1 rounded-t-[4px] border-t border-x flex items-center gap-1.5 transition-colors ${
            activeTab === 'stack'
              ? 'bg-white border-[#d5d3cc] text-[#2e3436] font-semibold border-b-transparent -mb-[1px] z-10 shadow-2xs'
              : 'bg-transparent border-transparent text-[#555] hover:text-[#222]'
          }`}
        >
          <DualGearsIcon className="w-3.5 h-3.5 text-[#555753]" />
          <span>Stack</span>
        </button>

        {/* KeyPad Tab */}
        <button
          onClick={() => setActiveTab('keypad')}
          className={`px-3 py-1 rounded-t-[4px] border-t border-x flex items-center gap-1.5 transition-colors ${
            activeTab === 'keypad'
              ? 'bg-white border-[#d5d3cc] text-[#2e3436] font-semibold border-b-transparent -mb-[1px] z-10 shadow-2xs'
              : 'bg-transparent border-transparent text-[#555] hover:text-[#222]'
          }`}
        >
          <KeyPadIcon />
          <span>KeyPad</span>
        </button>

        {/* Memory Tab (Official GNUSim8085 Full Address Space) */}
        <button
          onClick={() => setActiveTab('memory')}
          className={`px-3 py-1 rounded-t-[4px] border-t border-x flex items-center gap-1 transition-colors ${
            activeTab === 'memory'
              ? 'bg-white border-[#d5d3cc] text-[#2e3436] font-semibold border-b-transparent -mb-[1px] z-10 shadow-2xs'
              : 'bg-transparent border-transparent text-[#555] hover:text-[#222]'
          }`}
        >
          <span>Memory</span>
        </button>

        {/* I/O Ports Tab */}
        <button
          onClick={() => setActiveTab('io')}
          className={`px-3 py-1 rounded-t-[4px] border-t border-x flex items-center gap-1 transition-colors ${
            activeTab === 'io'
              ? 'bg-white border-[#d5d3cc] text-[#2e3436] font-semibold border-b-transparent -mb-[1px] z-10 shadow-2xs'
              : 'bg-transparent border-transparent text-[#555] hover:text-[#222]'
          }`}
        >
          <span>I/O Ports</span>
        </button>
      </div>

      {/* Tab Content Box (Matching screenshot border and layout) */}
      <div className="h-72 bg-white border-b border-[#c2c0ba] flex flex-col overflow-hidden">
        {/* 1. DATA TAB (Exact layout matching user's uploaded image: Address | Variable | Value | Value (Decimal)) */}
        {activeTab === 'data' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto border-t border-x border-[#d5d3cc] m-1.5 mb-1 bg-white">
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead>
                  <tr className="bg-white text-[#333] border-b border-[#d5d3cc] font-sans text-[11px] sticky top-0 z-10">
                    <th className="py-1 px-2 font-normal border-r border-[#d5d3cc] w-[24%] bg-[#fafafa]">Address</th>
                    <th className="py-1 px-2 font-normal border-r border-[#d5d3cc] w-[26%] bg-[#fafafa]">Variable</th>
                    <th className="py-1 px-2 font-normal border-r border-[#d5d3cc] w-[24%] bg-[#fafafa]">Value</th>
                    <th className="py-1 px-2 font-normal w-[26%] bg-[#fafafa]">Value (Decimal)</th>
                  </tr>
                </thead>
                <tbody>
                  {dataRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 px-3 text-center text-slate-500 font-sans text-xs">
                        <div className="font-semibold text-slate-700">No memory variables active yet.</div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Run code with STA / MOV M, or watch common 8085 memory locations below:
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                          <button
                            onClick={() => handleAddWatch(0x2050)}
                            className="px-2 py-0.5 text-[10px] font-mono bg-[#f0eee9] hover:bg-[#e4e2dc] border border-[#b8b6b0] rounded-xs text-blue-700 font-bold"
                          >
                            + 2050H
                          </button>
                          <button
                            onClick={() => handleAddWatch(0x2051)}
                            className="px-2 py-0.5 text-[10px] font-mono bg-[#f0eee9] hover:bg-[#e4e2dc] border border-[#b8b6b0] rounded-xs text-blue-700 font-bold"
                          >
                            + 2051H
                          </button>
                          <button
                            onClick={() => handleAddWatch(0x2052)}
                            className="px-2 py-0.5 text-[10px] font-mono bg-[#f0eee9] hover:bg-[#e4e2dc] border border-[#b8b6b0] rounded-xs text-blue-700 font-bold"
                          >
                            + 2052H
                          </button>
                          <button
                            onClick={() => handleAddWatch(0x2000)}
                            className="px-2 py-0.5 text-[10px] font-mono bg-[#f0eee9] hover:bg-[#e4e2dc] border border-[#b8b6b0] rounded-xs text-blue-700 font-bold"
                          >
                            + 2000H
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    dataRows.map((row) => (
                      <tr
                        key={`${row.addressNum}-${row.value}-${memoryVersion}`}
                        className={`border-b border-[#f0eee9] transition-colors ${
                          row.isTarget
                            ? 'bg-[#fff9db] font-semibold text-slate-900 ring-1 ring-amber-400'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <td
                          onClick={() => {
                            handleJumpToMemory(row.addressNum);
                            setActiveTab('memory');
                          }}
                          className="py-1 px-2 border-r border-[#f0eee9] text-blue-700 font-semibold cursor-pointer hover:underline"
                          title="Click to jump to this address in Memory Tab"
                        >
                          {row.address}
                          {row.isTarget && (
                            <span className="ml-1 text-[8px] bg-amber-400 text-slate-900 px-1 py-0.2 rounded-xs font-sans font-bold uppercase">
                              Answer
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-2 border-r border-[#f0eee9] font-sans font-medium text-slate-800">
                          {row.variable}
                        </td>
                        {/* Hex editable input */}
                        <td className="py-0.5 px-1 border-r border-[#f0eee9]">
                          <input
                            type="text"
                            defaultValue={row.value.replace(/h$/i, '')}
                            key={`data-hex-${row.addressNum}-${row.value}-${memoryVersion}`}
                            onBlur={(e) => {
                              const clean = e.target.value.trim().replace(/h$/i, '');
                              const n = parseInt(clean, 16);
                              if (!isNaN(n)) {
                                onWriteMemory(row.addressNum, n & 0xff);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="w-14 px-1 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white text-slate-900 font-bold font-mono outline-none rounded-xs uppercase text-center"
                            title="Edit Hex byte (e.g. 05)"
                          />
                        </td>
                        {/* Decimal editable input */}
                        <td className="py-0.5 px-1">
                          <input
                            type="text"
                            defaultValue={row.decimal}
                            key={`data-dec-${row.addressNum}-${row.decimal}-${memoryVersion}`}
                            onBlur={(e) => {
                              const clean = e.target.value.trim();
                              const n = parseInt(clean, 10);
                              if (!isNaN(n)) {
                                onWriteMemory(row.addressNum, Math.max(0, Math.min(255, n)));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="w-14 px-1 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white text-slate-700 font-mono outline-none rounded-xs text-center"
                            title="Edit Decimal value (0-255)"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Quick Watch Bar at Bottom of Data Tab */}
            <div className="px-2 py-1 bg-[#f7f6f4] border-t border-[#d8d6d0] flex items-center justify-between text-[11px] font-sans gap-1.5">
              <div className="flex items-center gap-1">
                <span className="text-slate-600 font-medium">Watch:</span>
                <input
                  type="text"
                  value={watchInput}
                  onChange={(e) => setWatchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddWatch()}
                  placeholder="2050H"
                  className="w-16 bg-white border border-[#b8b6b0] px-1.5 py-0.5 text-xs font-mono rounded-xs uppercase outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => handleAddWatch()}
                  className="gtk-btn px-2 py-0.5 text-[11px] font-semibold text-slate-800"
                >
                  + Add
                </button>
              </div>

              {/* Quick Jump/Watch presets */}
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <button
                  onClick={() => handleAddWatch(0x2050)}
                  className="hover:text-blue-700 underline font-mono cursor-pointer"
                  title="Watch address 2050H"
                >
                  +2050H
                </button>
                <button
                  onClick={() => handleAddWatch(0x2051)}
                  className="hover:text-blue-700 underline font-mono cursor-pointer"
                  title="Watch address 2051H"
                >
                  +2051H
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. STACK TAB */}
        {activeTab === 'stack' && (
          <div className="flex-1 overflow-auto p-2 font-mono text-[11px] space-y-1">
            <div className="text-[10px] text-slate-500 font-sans pb-1 mb-1 border-b border-slate-200">
              Stack Pointer: <strong className="text-purple-700">{sp.toString(16).toUpperCase().padStart(4, '0')}h</strong>
            </div>
            {stackEntries.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between px-2 py-0.5 rounded-xs ${
                  item.isSP ? 'bg-purple-100 font-bold text-purple-900 border border-purple-300' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{item.address} {item.isSP ? '◀ SP' : ''}</span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* 3. KEYPAD TAB */}
        {activeTab === 'keypad' && (
          <div className="flex-1 overflow-auto p-2 space-y-2">
            <div className="text-[11px] font-sans text-slate-700 font-semibold">
              Instruction Keypad:
            </div>
            <div className="grid grid-cols-4 gap-1">
              {['MOV', 'MVI', 'LXI', 'LDA', 'STA', 'ADD', 'ADI', 'SUB', 'SUI', 'INR', 'DCR', 'JMP', 'JNZ', 'JZ', 'CALL', 'RET', 'PUSH', 'POP', 'IN', 'OUT', 'NOP', 'HLT'].map((ins) => (
                <button
                  key={ins}
                  onClick={() => setSelectedMnemonic(ins)}
                  className={`py-1 text-center font-mono text-xs font-bold rounded-xs border ${
                    selectedMnemonic === ins
                      ? 'bg-[#3465a4] text-white border-[#204a87]'
                      : 'bg-[#faf9f7] text-[#2e3436] border-[#c2c0ba] hover:bg-[#edece8]'
                  }`}
                >
                  {ins}
                </button>
              ))}
            </div>

            <div className="flex gap-2 items-center pt-1">
              <span className="font-mono text-xs font-bold text-slate-800">{selectedMnemonic}</span>
              <input
                type="text"
                value={arg1}
                onChange={(e) => setArg1(e.target.value)}
                placeholder="operands"
                className="w-24 bg-white border border-[#b8b6b0] px-1.5 py-0.5 font-mono text-xs rounded-xs"
              />
              <button
                onClick={() => onInsertInstruction(`      ${selectedMnemonic} ${arg1}`.trim())}
                className="gtk-btn px-2.5 py-0.5 text-xs text-slate-800 font-semibold"
              >
                Insert
              </button>
            </div>
          </div>
        )}

        {/* 4. MEMORY TAB - Official GNUSim8085 Full Address Space (0000H - FFFFH) */}
        {activeTab === 'memory' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {/* Top Navigation & Jump Controls matching GNUSim8085 manual: Start: [ 2000 ] [ OK ] */}
            <div className="p-1.5 bg-[#f7f6f4] border-b border-[#d8d6d0] flex flex-wrap items-center justify-between text-[11px] font-sans gap-1">
              <div className="flex items-center gap-1">
                <span className="text-slate-700 font-medium">Start:</span>
                <input
                  type="text"
                  value={memJumpInput}
                  onChange={(e) => setMemJumpInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyJump()}
                  placeholder="e.g. 2000"
                  className="w-14 bg-white border border-[#b8b6b0] px-1.5 py-0.5 text-xs font-mono text-center outline-none rounded-xs uppercase font-semibold"
                />
                <button
                  onClick={handleApplyJump}
                  className="gtk-btn px-2 py-0.5 text-[11px] font-semibold text-slate-800"
                  title="Jump to this memory address"
                >
                  OK
                </button>
              </div>

              {/* Quick Jump Buttons for standard 8085 Memory Regions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleJumpToMemory(0x2000)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono rounded-xs border ${
                    memOffset >= 0x2000 && memOffset < 0x3000 ? 'bg-blue-100 border-blue-400 font-bold' : 'bg-white border-[#ccc]'
                  }`}
                  title="Jump to 2000H (Common Data Area)"
                >
                  2000H
                </button>
                <button
                  onClick={() => handleJumpToMemory(0x2050)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono rounded-xs border ${
                    memOffset >= 0x2050 && memOffset < 0x2060 ? 'bg-blue-100 border-blue-400 font-bold' : 'bg-white border-[#ccc]'
                  }`}
                  title="Jump to 2050H (Common Result Area)"
                >
                  2050H
                </button>
                <button
                  onClick={() => handleJumpToMemory(0x4200)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono rounded-xs border ${
                    memOffset >= 0x4200 && memOffset < 0x5000 ? 'bg-blue-100 border-blue-400 font-bold' : 'bg-white border-[#ccc]'
                  }`}
                  title="Jump to 4200H (Default Code Load Area)"
                >
                  4200H
                </button>
              </div>

              {/* View Switcher: List Table vs Hex Grid */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMemoryViewMode('table')}
                  className={`px-1.5 py-0.5 text-[10px] rounded-xs border ${
                    memoryViewMode === 'table' ? 'bg-[#3465a4] text-white border-[#204a87] font-bold' : 'bg-white border-[#ccc]'
                  }`}
                  title="List Table (Address, Data Hex, Data Decimal)"
                >
                  ☰ List
                </button>
                <button
                  onClick={() => setMemoryViewMode('grid')}
                  className={`px-1.5 py-0.5 text-[10px] rounded-xs border ${
                    memoryViewMode === 'grid' ? 'bg-[#3465a4] text-white border-[#204a87] font-bold' : 'bg-white border-[#ccc]'
                  }`}
                  title="Grid Matrix (Hex Dump)"
                >
                  ▦ Grid
                </button>
              </div>
            </div>

            {/* Pagination Sub-bar */}
            <div className="px-2 py-0.5 bg-[#f0eee9] border-b border-[#e0ded8] flex items-center justify-between text-[10px] font-sans text-slate-600 gap-1">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleJumpToMemory(Math.max(0, memOffset - pageSize))}
                  className="gtk-btn px-1.5 py-0.2"
                  title="Previous page"
                >
                  ◀ Prev
                </button>
                <button
                  onClick={() => handleJumpToMemory(Math.min(0xffff - pageSize + 1, memOffset + pageSize))}
                  className="gtk-btn px-1.5 py-0.2"
                  title="Next page"
                >
                  Next ▶
                </button>
              </div>

              <span className="font-mono text-slate-700">
                <strong>{memOffset.toString(16).toUpperCase().padStart(4, '0')}H</strong> –{' '}
                <strong>{Math.min(0xffff, memOffset + pageSize - 1).toString(16).toUpperCase().padStart(4, '0')}H</strong> of 65536
              </span>

              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500">Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-white border border-[#b8b6b0] text-[10px] px-1 py-0.2 rounded-xs font-mono"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={256}>256</option>
                  <option value={512}>512</option>
                  <option value={1000}>1000</option>
                </select>
                {focusedMemoryAddress !== null && focusedMemoryAddress !== undefined && (
                  <button
                    onClick={() => handleJumpToMemory(focusedMemoryAddress)}
                    className="px-1.5 py-0.2 bg-amber-200 hover:bg-amber-300 border border-amber-400 text-amber-900 font-bold rounded-xs text-[10px] cursor-pointer"
                    title="Jump to where execution stored answer"
                  >
                    🎯 {focusedMemoryAddress.toString(16).toUpperCase().padStart(4, '0')}H
                  </button>
                )}
              </div>
            </div>

            {/* View Mode 1: OFFICIAL GNUSIM8085 TABLE: Address | Data (Hex) | Data (Decimal) */}
            {memoryViewMode === 'table' ? (
              <div className="flex-1 overflow-auto border-t border-[#d5d3cc]">
                <table className="w-full text-left font-mono text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-white text-[#333] border-b border-[#d5d3cc] font-sans text-[11px] sticky top-0 z-10 shadow-2xs">
                      <th className="py-1 px-2 font-normal border-r border-[#d5d3cc] w-[30%] bg-[#fafafa]">Address</th>
                      <th className="py-1 px-2 font-normal border-r border-[#d5d3cc] w-[35%] bg-[#fafafa]">Data (Hex)</th>
                      <th className="py-1 px-2 font-normal w-[35%] bg-[#fafafa]">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: pageSize }).map((_, i) => {
                      const addr = memOffset + i;
                      if (addr > 0xffff) return null;
                      const val = memory[addr] || 0;
                      const isFocused = focusedMemoryAddress === addr;
                      const isWritten = recentWrites.some((w) => w.address === addr);

                      return (
                        <tr
                          key={`${addr}-${val}-${memoryVersion}`}
                          className={`border-b border-[#f0eee9] hover:bg-slate-50 transition-colors ${
                            isFocused
                              ? 'bg-[#fff9db] font-bold ring-1 ring-amber-400'
                              : isWritten
                              ? 'bg-amber-50/70 font-semibold'
                              : ''
                          }`}
                        >
                          <td className="py-0.5 px-2 border-r border-[#f0eee9] text-blue-700 font-semibold">
                            {addr.toString(16).toUpperCase().padStart(4, '0')}h
                            {isFocused && (
                              <span className="ml-1 text-[9px] bg-amber-400 text-slate-900 px-1 py-0.2 rounded-xs font-sans font-bold">
                                Target Answer
                              </span>
                            )}
                          </td>

                          {/* Data (Hex) Column - Editable directly */}
                          <td className="py-0.5 px-1 border-r border-[#f0eee9]">
                            <input
                              type="text"
                              defaultValue={val.toString(16).toUpperCase().padStart(2, '0')}
                              key={`${addr}-hex-${val}-${memoryVersion}`}
                              onBlur={(e) => {
                                const clean = e.target.value.trim().replace(/h$/i, '');
                                const n = parseInt(clean, 16);
                                if (!isNaN(n)) {
                                  onWriteMemory(addr, n & 0xff);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-12 px-1 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white text-slate-900 font-bold font-mono outline-none rounded-xs uppercase text-center"
                              title="Click to edit Hex value directly"
                            />
                          </td>

                          {/* Data (Decimal) Column - Editable directly */}
                          <td className="py-0.5 px-1">
                            <input
                              type="text"
                              defaultValue={val.toString(10)}
                              key={`${addr}-dec-${val}-${memoryVersion}`}
                              onBlur={(e) => {
                                const clean = e.target.value.trim();
                                const n = parseInt(clean, 10);
                                if (!isNaN(n)) {
                                  onWriteMemory(addr, Math.max(0, Math.min(255, n)));
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-12 px-1 py-0.5 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white text-slate-700 font-mono outline-none rounded-xs text-center"
                              title="Click to edit Decimal value directly"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* View Mode 2: GRID MATRIX VIEW (8 bytes per row with ASCII) */
              <div className="flex-1 overflow-auto p-2 font-mono text-[11px] space-y-1">
                <div className="text-[10px] text-slate-500 font-sans pb-1 border-b flex justify-between">
                  <span>Hex Matrix (8 Bytes per Row)</span>
                  <span>Click byte to edit</span>
                </div>
                {Array.from({ length: 32 }).map((_, r) => {
                  const rowAddr = memOffset + r * 8;
                  if (rowAddr > 0xffff) return null;

                  return (
                    <div key={rowAddr} className="flex gap-2 text-slate-700 items-center hover:bg-slate-50 py-0.5">
                      <span className="text-blue-700 font-semibold w-12 shrink-0">
                        {rowAddr.toString(16).toUpperCase().padStart(4, '0')}h:
                      </span>
                      <div className="flex gap-1">
                        {Array.from({ length: 8 }).map((_, c) => {
                          const cellAddr = rowAddr + c;
                          if (cellAddr > 0xffff) return null;
                          const b = memory[cellAddr] || 0;
                          const isTarget = focusedMemoryAddress === cellAddr;

                          return (
                            <span
                              key={c}
                              onClick={() => {
                                const valStr = prompt(
                                  `Set byte at ${cellAddr.toString(16).toUpperCase()}h (Hex):`,
                                  b.toString(16).toUpperCase()
                                );
                                if (valStr !== null) {
                                  const v = parseInt(valStr.replace(/h$/i, ''), 16);
                                  if (!isNaN(v)) onWriteMemory(cellAddr, v & 0xff);
                                }
                              }}
                              className={`px-1 py-0.5 rounded-xs transition-colors cursor-pointer text-center w-6 ${
                                isTarget
                                  ? 'bg-amber-300 ring-2 ring-amber-500 font-bold text-slate-900 shadow-xs'
                                  : 'hover:bg-amber-100 text-slate-800'
                              }`}
                              title={`Address: ${cellAddr.toString(16).toUpperCase().padStart(4, '0')}h\nHex: ${b.toString(16).toUpperCase().padStart(2, '0')}h\nDec: ${b}\nClick to edit`}
                            >
                              {b.toString(16).toUpperCase().padStart(2, '0')}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 5. I/O PORTS TAB */}
        {activeTab === 'io' && (
          <div className="flex-1 overflow-auto p-2 space-y-2">
            <div className="text-[11px] font-sans font-semibold text-slate-700">
              Virtual Hardware Outputs:
            </div>
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-xs">
              <div className="text-[10px] text-slate-600 mb-1">Port 01H (LED Bar):</div>
              <div className="flex gap-1 justify-center">
                {Array.from({ length: 8 }).map((_, i) => {
                  const bit = 7 - i;
                  const on = (ioPorts[0x01] & (1 << bit)) !== 0;
                  return (
                    <div
                      key={bit}
                      className={`w-4 h-4 rounded-full border ${
                        on ? 'bg-red-500 shadow-xs' : 'bg-slate-300'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="p-2 bg-slate-50 border border-slate-200 rounded-xs flex items-center justify-between">
              <span className="text-[10px] text-slate-600">Port 02H (7-Seg Hex):</span>
              <span className="font-mono text-xl font-black text-amber-600 bg-white border px-2 py-0.5 rounded-xs">
                {(ioPorts[0x02] || 0).toString(16).toUpperCase().padStart(2, '0')}h
              </span>
            </div>
          </div>
        )}
      </div>

      {/* BIG CONSOLE AREA (Requested explicitly: "console must be big") */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden min-h-[200px]">
        {/* Console Header matching screenshot: Line No | Assembler Message */}
        <div className="bg-[#f2efe9] border-b border-[#c2c0ba] px-2 py-1 text-[11px] font-sans text-slate-700 font-semibold flex items-center justify-between select-none">
          <div className="flex items-center gap-12">
            <span className="w-16">Line No</span>
            <span>Assembler Message</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            {assemblerMessages.length} log{assemblerMessages.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Big Console Messages Table */}
        <div className="flex-1 overflow-y-auto p-1 font-mono text-xs select-text">
          <table className="w-full text-left">
            <tbody>
              {assemblerMessages.map((msg, index) => (
                <tr
                  key={index}
                  className={`border-b border-[#f4f3ef] hover:bg-slate-50 ${
                    msg.type === 'error'
                      ? 'bg-rose-50/70 text-rose-700'
                      : msg.type === 'success'
                      ? 'text-emerald-700'
                      : 'text-[#2e3436]'
                  }`}
                >
                  <td className="py-1 px-2 w-16 tabular-nums font-sans text-slate-500 align-top">
                    {msg.line}
                  </td>
                  <td className="py-1 px-2 font-mono text-[11px] align-top">
                    {msg.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
