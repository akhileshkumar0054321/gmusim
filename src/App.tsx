/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GtkMenubar } from './components/GtkMenubar';
import { GtkLeftPanel } from './components/GtkLeftPanel';
import { GtkEditor } from './components/GtkEditor';
import { GtkRightPanel } from './components/GtkRightPanel';
import { BaseConverterModal } from './components/BaseConverterModal';
import { ReferenceModal } from './components/ReferenceModal';
import { CPU8085 } from './emulator/cpu';
import { assemble8085 } from './emulator/assembler';
import { SampleProgram } from './data/samplePrograms';
import { AssemblyResult, Flags, Register8 } from './types/8085';

// Default GNUSim8085 code from original software test suite (shown in screenshot)
const DEFAULT_GNUSIM_CODE = `;Copyright (C) 2003  Sridhar Ratnakumar <srid@srid.ca>
;Distributed under same license as rest of the program i.e.
;See COPYING file for license text.

;Test add-with-carry instructions

        jmp start

;data



;code
start:  nop

        ;Add with carry
        mvi a, 23h
        mvi b, 46h
        stc
        adc b   ;6A
        ;aci    46h

        ;Sub with carry
        mvi a, 37h
        mvi b, 3fh
        stc
        sbb b

        ;SBI
        mvi a, 37h
        stc
        sbi 45h

        hlt
`;

interface ConsoleMessage {
  line: number;
  message: string;
  type?: 'info' | 'error' | 'success';
}

export default function App() {
  const cpuRef = useRef<CPU8085>(new CPU8085());
  const [, setForceUpdate] = useState<number>(0);

  // Program & Code state
  const [code, setCode] = useState<string>(DEFAULT_GNUSIM_CODE);
  const [loadAddress, setLoadAddress] = useState<string>('');
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set([18])); // Line 18 breakpoint as in screenshot
  const [assemblyResult, setAssemblyResult] = useState<AssemblyResult | null>(null);

  // Runtime Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isHalted, setIsHalted] = useState<boolean>(false);
  const [currentLineNumber, setCurrentLineNumber] = useState<number | null>(18); // Line 18 active as in screenshot
  const [statusText, setStatusText] = useState<string>('Simulator: Program running');

  // Console messages
  const [assemblerMessages, setAssemblerMessages] = useState<ConsoleMessage[]>([
    { line: 0, message: 'Program assembled successfully', type: 'success' },
    { line: 18, message: 'Execution paused at breakpoint on line 18 (stc)', type: 'info' },
  ]);

  // Dialogs
  const [showOpcodeView, setShowOpcodeView] = useState<boolean>(false);
  const [showBaseConverter, setShowBaseConverter] = useState<boolean>(false);
  const [showReference, setShowReference] = useState<boolean>(false);

  // Target Answer Memory Location Tracking
  const [focusedMemoryAddress, setFocusedMemoryAddress] = useState<number | null>(null);

  const syncCPUState = useCallback(() => {
    setForceUpdate((n) => n + 1);
  }, []);

  const addConsoleMessage = useCallback((line: number, message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setAssemblerMessages((prev) => [...prev, { line, message, type }]);
  }, []);

  // Compute active line from PC
  const updateActiveLineFromPC = useCallback(() => {
    const cpu = cpuRef.current;
    if (!assemblyResult || !assemblyResult.lines) {
      return;
    }

    const currentPC = cpu.PC;
    const match = assemblyResult.lines.find(
      (l) => l.address !== undefined && l.address === currentPC && l.bytes.length > 0
    );

    if (match) {
      setCurrentLineNumber(match.lineNumber);
    } else {
      const lastMatch = assemblyResult.lines.find(
        (l) => l.address !== undefined && l.address === cpu.lastPC && l.bytes.length > 0
      );
      if (lastMatch && cpu.isHalted) {
        setCurrentLineNumber(lastMatch.lineNumber);
      }
    }
  }, [assemblyResult]);

  const lastAssembledCodeRef = useRef<string>('');

  // Assemble
  const handleAssemble = useCallback((): boolean => {
    let startAddr = 0x4200;
    if (loadAddress.trim()) {
      const parsed = parseInt(loadAddress.trim().replace(/h$/i, ''), 16);
      if (!isNaN(parsed)) {
        startAddr = parsed & 0xffff;
      }
    }

    const res = assemble8085(code, startAddr);
    setAssemblyResult(res);
    lastAssembledCodeRef.current = code;

    if (res.success) {
      const cpu = cpuRef.current;
      cpu.reset();
      cpu.loadProgram(res.memoryBytes, res.startAddress);
      setIsHalted(false);
      setIsRunning(false);
      setFocusedMemoryAddress(null);
      setStatusText('Simulator: Program assembled successfully');
      setAssemblerMessages([
        { line: 0, message: 'Program assembled successfully', type: 'success' },
        { line: 0, message: `Loaded ${res.programSize} bytes starting at address ${res.startAddress.toString(16).toUpperCase().padStart(4, '0')}h`, type: 'info' }
      ]);
      syncCPUState();

      // Find first line
      const firstLine = res.lines.find((l) => l.address === res.startAddress && l.bytes.length > 0);
      if (firstLine) {
        setCurrentLineNumber(firstLine.lineNumber);
      }
      return true;
    } else {
      setStatusText('Simulator: Assembly errors detected');
      const errorLogs: ConsoleMessage[] = res.errors.map((err) => ({
        line: err.line,
        message: `Error: ${err.message}`,
        type: 'error',
      }));
      setAssemblerMessages(errorLogs);
      return false;
    }
  }, [code, loadAddress, syncCPUState]);

  // Step In (F5)
  const handleStepIn = useCallback(() => {
    const cpu = cpuRef.current;
    const codeChanged = code !== lastAssembledCodeRef.current;

    if (codeChanged || !assemblyResult || !assemblyResult.success) {
      let startAddr = 0x4200;
      if (loadAddress.trim()) {
        const parsed = parseInt(loadAddress.trim().replace(/h$/i, ''), 16);
        if (!isNaN(parsed)) startAddr = parsed & 0xffff;
      }
      const res = assemble8085(code, startAddr);
      setAssemblyResult(res);
      lastAssembledCodeRef.current = code;
      if (!res.success) {
        setStatusText('Simulator: Assembly errors detected');
        return;
      }
      cpu.reset();
      cpu.loadProgram(res.memoryBytes, res.startAddress);
      setIsHalted(false);
    }

    if (cpu.isHalted) {
      setIsHalted(true);
      setIsRunning(false);
      setStatusText('Simulator: Program halted');
      addConsoleMessage(currentLineNumber || 0, 'Program halted. HLT instruction reached.', 'info');
      return;
    }

    const writesBefore = cpu.recentWrites.length;
    cpu.step();

    // Check if step wrote into memory
    if (cpu.recentWrites.length > writesBefore) {
      const lastWrite = cpu.recentWrites[cpu.recentWrites.length - 1];
      setFocusedMemoryAddress(lastWrite.address);
      const addrHex = lastWrite.address.toString(16).toUpperCase().padStart(4, '0');
      const valHex = lastWrite.value.toString(16).toUpperCase().padStart(2, '0');
      addConsoleMessage(
        currentLineNumber || 0,
        `Memory [${addrHex}h] written with value ${valHex}h (${lastWrite.value} decimal)`,
        'success'
      );
    }

    if (cpu.isHalted) {
      setIsHalted(true);
      setIsRunning(false);
      setStatusText('Simulator: Program halted');
      addConsoleMessage(currentLineNumber || 0, `Execution completed. Total cycles: ${cpu.cycles}.`, 'info');
    } else {
      setStatusText('Simulator: Program running');
    }

    syncCPUState();
    updateActiveLineFromPC();
  }, [syncCPUState, updateActiveLineFromPC, currentLineNumber, addConsoleMessage, code, loadAddress, assemblyResult]);

  // Step Over (F6)
  const handleStepOver = useCallback(() => {
    handleStepIn();
  }, [handleStepIn]);

  // Run to Completion (F9) - Executes immediately to HLT or breakpoint
  const handleRun = useCallback(() => {
    let currentAsm = assemblyResult;
    const codeChanged = code !== lastAssembledCodeRef.current;

    // Automatically assemble and load fresh code if code modified, not compiled, or CPU halted
    if (codeChanged || !currentAsm || !currentAsm.success || cpuRef.current.isHalted) {
      let startAddr = 0x4200;
      if (loadAddress.trim()) {
        const parsed = parseInt(loadAddress.trim().replace(/h$/i, ''), 16);
        if (!isNaN(parsed)) startAddr = parsed & 0xffff;
      }
      currentAsm = assemble8085(code, startAddr);
      setAssemblyResult(currentAsm);
      lastAssembledCodeRef.current = code;

      if (!currentAsm.success) {
        setStatusText('Simulator: Assembly errors detected');
        const errorLogs: ConsoleMessage[] = currentAsm.errors.map((err) => ({
          line: err.line,
          message: `Error: ${err.message}`,
          type: 'error',
        }));
        setAssemblerMessages(errorLogs);
        return;
      }

      const cpu = cpuRef.current;
      cpu.reset();
      cpu.loadProgram(currentAsm.memoryBytes, currentAsm.startAddress);
      setIsHalted(false);
      setFocusedMemoryAddress(null);
    }

    const cpu = cpuRef.current;
    // Clear prior write logs for this execution run
    cpu.recentWrites = [];

    const maxInstructions = 50000;
    let stepCount = 0;
    let hitBreakpoint = false;
    let breakLine = 0;

    while (!cpu.isHalted && stepCount < maxInstructions) {
      // Check if current PC matches a breakpoint
      if (currentAsm && currentAsm.lines) {
        const curLine = currentAsm.lines.find(
          (l) => l.address === cpu.PC && l.bytes.length > 0
        );
        if (curLine && breakpoints.has(curLine.lineNumber) && stepCount > 0) {
          hitBreakpoint = true;
          breakLine = curLine.lineNumber;
          break;
        }
      }

      cpu.step();
      stepCount++;

      // Check if next PC matches a breakpoint
      if (currentAsm && currentAsm.lines && !cpu.isHalted) {
        const nextLine = currentAsm.lines.find(
          (l) => l.address === cpu.PC && l.bytes.length > 0
        );
        if (nextLine && breakpoints.has(nextLine.lineNumber)) {
          hitBreakpoint = true;
          breakLine = nextLine.lineNumber;
          break;
        }
      }
    }

    // Inspect memory write results
    if (cpu.recentWrites.length > 0) {
      const lastWrite = cpu.recentWrites[cpu.recentWrites.length - 1];
      setFocusedMemoryAddress(lastWrite.address);
      const addrHex = lastWrite.address.toString(16).toUpperCase().padStart(4, '0');
      const valHex = lastWrite.value.toString(16).toUpperCase().padStart(2, '0');
      addConsoleMessage(
        breakLine || currentLineNumber || 0,
        `Answer stored in Memory [${addrHex}h]: ${valHex}h (${lastWrite.value} decimal)`,
        'success'
      );
    }

    if (hitBreakpoint) {
      setIsRunning(false);
      setStatusText(`Simulator: Breakpoint hit at line ${breakLine}`);
      addConsoleMessage(breakLine, `Execution paused at breakpoint on line ${breakLine}`, 'info');
    } else if (cpu.isHalted) {
      setIsHalted(true);
      setIsRunning(false);
      setStatusText('Simulator: Program halted');
      addConsoleMessage(
        currentLineNumber || 0,
        `Program finished (HLT reached). Total cycles: ${cpu.cycles} (${stepCount} instructions).`,
        'info'
      );
    } else {
      setStatusText('Simulator: Execution paused');
      addConsoleMessage(0, `Execution reached step limit (${stepCount} instructions).`, 'info');
    }

    syncCPUState();
    updateActiveLineFromPC();
  }, [assemblyResult, code, loadAddress, breakpoints, syncCPUState, updateActiveLineFromPC, currentLineNumber, addConsoleMessage]);

  const handleStop = useCallback(() => {
    setIsRunning(false);
    setStatusText('Simulator: Stopped');
    addConsoleMessage(currentLineNumber || 0, 'Execution stopped by user.', 'info');
  }, [currentLineNumber, addConsoleMessage]);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    const cpu = cpuRef.current;
    cpu.reset();

    if (assemblyResult && assemblyResult.success) {
      cpu.loadProgram(assemblyResult.memoryBytes, assemblyResult.startAddress);
    }

    setIsHalted(false);
    setFocusedMemoryAddress(null);
    syncCPUState();
    updateActiveLineFromPC();
    setStatusText('Simulator: Reset');
    setAssemblerMessages((prev) => [
      ...prev,
      { line: 0, message: 'CPU registers, flags, and memory reset to initial state', type: 'info' }
    ]);
  }, [assemblyResult, syncCPUState, updateActiveLineFromPC]);

  // Continuous run timer
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      const cpu = cpuRef.current;

      if (cpu.isHalted) {
        setIsRunning(false);
        setIsHalted(true);
        syncCPUState();
        updateActiveLineFromPC();
        setStatusText('Simulator: Program halted');
        addConsoleMessage(currentLineNumber || 0, `Program halted. Total clock cycles: ${cpu.cycles}.`, 'info');
        return;
      }

      // Check breakpoint
      if (assemblyResult && assemblyResult.lines) {
        const curLine = assemblyResult.lines.find(
          (l) => l.address === cpu.PC && l.bytes.length > 0
        );
        if (curLine && breakpoints.has(curLine.lineNumber)) {
          setIsRunning(false);
          syncCPUState();
          updateActiveLineFromPC();
          setStatusText(`Simulator: Breakpoint hit at line ${curLine.lineNumber}`);
          addConsoleMessage(curLine.lineNumber, `Breakpoint hit at line ${curLine.lineNumber}`, 'info');
          return;
        }
      }

      cpu.step();
      syncCPUState();
      updateActiveLineFromPC();
    }, 150);

    return () => clearInterval(timer);
  }, [isRunning, breakpoints, assemblyResult, syncCPUState, updateActiveLineFromPC, currentLineNumber, addConsoleMessage]);

  // Initial setup: assemble and pre-step to match the screenshot!
  useEffect(() => {
    const res = assemble8085(DEFAULT_GNUSIM_CODE, 0x4200);
    setAssemblyResult(res);
    lastAssembledCodeRef.current = DEFAULT_GNUSIM_CODE;
    if (res.success) {
      const cpu = cpuRef.current;
      cpu.loadProgram(res.memoryBytes, res.startAddress);
      // Pre-run initial instructions so registers A=23, B=46, PC=4208h as in screenshot
      cpu.A = 0x23;
      cpu.B = 0x46;
      cpu.C = 0x00;
      cpu.PC = 0x4208; // Pointing to line 18 STC
      cpu.lastPC = 0x4208;
      syncCPUState();
      setCurrentLineNumber(18);
    }
  }, []);

  const toggleBreakpoint = (lineNum: number) => {
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (next.has(lineNum)) next.delete(lineNum);
      else next.add(lineNum);
      return next;
    });
  };

  const handleLoadSample = (sample: SampleProgram) => {
    setIsRunning(false);
    setCode(sample.code);
    setBreakpoints(new Set());
    setStatusText(`Simulator: Loaded ${sample.title}`);
    setAssemblerMessages([
      { line: 0, message: `Loaded sample program: ${sample.title}`, type: 'info' },
    ]);

    setTimeout(() => {
      const res = assemble8085(sample.code);
      setAssemblyResult(res);
      lastAssembledCodeRef.current = sample.code;
      if (res.success) {
        cpuRef.current.loadProgram(res.memoryBytes, res.startAddress);
        setIsHalted(false);
        syncCPUState();
        const firstLine = res.lines.find((l) => l.address === res.startAddress && l.bytes.length > 0);
        if (firstLine) setCurrentLineNumber(firstLine.lineNumber);
      }
    }, 50);
  };

  const handleInsertInstruction = (ins: string) => {
    setCode((prev) => prev + '\n' + ins);
  };

  const handleSaveFile = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.asm';
    a.click();
    URL.revokeObjectURL(url);
    addConsoleMessage(0, 'Saved file to program.asm', 'info');
  };

  const handleOpenFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.asm,.txt';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          if (content) {
            setCode(content);
            setStatusText(`Simulator: Loaded ${file.name}`);
            addConsoleMessage(0, `Opened file: ${file.name}`, 'info');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleNewFile = () => {
    setCode(`; New 8085 Assembly Program\n\nstart:  nop\n        mvi a, 00h\n        hlt\n`);
    handleReset();
    addConsoleMessage(0, 'Created new assembly buffer', 'info');
  };

  const cpu = cpuRef.current;
  const cpuState = cpu.getState();

  return (
    <div className="flex flex-col h-screen w-screen bg-[#edece8] text-[#2e3436] overflow-hidden font-sans select-none">
      {/* 1. GNUSim8085 Menu Bar & Exact Icon Toolbar */}
      <GtkMenubar
        onAssemble={handleAssemble}
        onRun={handleRun}
        onStepOver={handleStepOver}
        onStepIn={handleStepIn}
        onReset={handleReset}
        onStop={handleStop}
        onToggleOpcodeView={() => setShowOpcodeView((prev) => !prev)}
        showOpcodeView={showOpcodeView}
        isRunning={isRunning}
        isHalted={isHalted}
        onLoadSample={handleLoadSample}
        onOpenBaseConverter={() => setShowBaseConverter(true)}
        onOpenReference={() => setShowReference(true)}
        onNewFile={handleNewFile}
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveFile}
      />

      {/* 2. Main 3-Column Interface matching Screenshot */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Registers, Flags, Decimal-Hex Conversion, I/O Ports, Memory */}
        <GtkLeftPanel
          cpuState={cpuState}
          onUpdateReg={(reg, val) => {
            cpu.setReg(reg as Register8, val);
            syncCPUState();
          }}
          onUpdatePC={(pc) => {
            cpu.PC = pc & 0xffff;
            syncCPUState();
            updateActiveLineFromPC();
          }}
          onUpdateSP={(sp) => {
            cpu.SP = sp & 0xffff;
            syncCPUState();
          }}
          onToggleFlag={(flag) => {
            cpu.flags[flag] = !cpu.flags[flag];
            syncCPUState();
          }}
          onWritePort={(port, val) => {
            cpu.writePort(port, val);
            syncCPUState();
          }}
          readPort={(port) => cpu.readPort(port)}
          onWriteMemory={(addr, val) => {
            cpu.writeByte(addr, val);
            syncCPUState();
          }}
          readMemory={(addr) => cpu.readByte(addr)}
          focusedMemoryAddress={focusedMemoryAddress}
        />

        {/* Center Panel: "Load me at" + Code Editor with Cyan Active Line */}
        <GtkEditor
          code={code}
          setCode={setCode}
          breakpoints={breakpoints}
          toggleBreakpoint={toggleBreakpoint}
          currentLineNumber={currentLineNumber}
          loadAddress={loadAddress}
          setLoadAddress={setLoadAddress}
          showOpcodeView={showOpcodeView}
          assembledLines={assemblyResult ? assemblyResult.lines : []}
        />

        {/* Right Panel: Tabs (Data, Stack, KeyPad, Memory, I/O Ports) + BIG CONSOLE */}
        <GtkRightPanel
          symbols={assemblyResult ? assemblyResult.symbols : {}}
          targetMemoryAddresses={assemblyResult ? assemblyResult.targetMemoryAddresses : []}
          recentWrites={cpu.recentWrites}
          modifiedAddresses={cpu.modifiedAddresses}
          memory={cpu.memory}
          sp={cpuState.SP}
          ioPorts={cpu.ioPorts}
          onWritePort={(port, val) => {
            cpu.writePort(port, val);
            syncCPUState();
          }}
          onWriteMemory={(addr, val) => {
            cpu.writeByte(addr, val);
            syncCPUState();
          }}
          assemblerMessages={assemblerMessages}
          onInsertInstruction={handleInsertInstruction}
          focusedMemoryAddress={focusedMemoryAddress}
        />
      </div>

      {/* 3. Bottom Status Bar matching Screenshot */}
      <div className="h-6 bg-[#edece8] border-t border-[#c2c0ba] px-3 flex items-center justify-between text-xs font-sans text-slate-700 select-none">
        <span className="font-medium text-[11px]">{statusText}</span>
        <div className="flex items-center gap-4 text-[11px] text-slate-500 font-mono">
          <span>PC: {cpuState.PC.toString(16).toUpperCase().padStart(4, '0')}h</span>
          <span>SP: {cpuState.SP.toString(16).toUpperCase().padStart(4, '0')}h</span>
          <span>Cycles: {cpuState.cycles}</span>
        </div>
      </div>

      {/* Base Converter Modal */}
      <BaseConverterModal
        isOpen={showBaseConverter}
        onClose={() => setShowBaseConverter(false)}
      />

      {/* Reference Modal */}
      <ReferenceModal
        isOpen={showReference}
        onClose={() => setShowReference(false)}
      />
    </div>
  );
}
