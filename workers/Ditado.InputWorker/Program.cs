using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

namespace Ditado.InputWorker
{
    internal sealed class WorkerRequest
    {
        public string id { get; set; }
        public string type { get; set; }
        public string text { get; set; }
        public string expectedWindowHandle { get; set; }
    }

    internal sealed class WorkerResponse
    {
        public string id { get; set; }
        public string type { get; set; }
        public bool ok { get; set; }
        public string error { get; set; }
        public string errorCode { get; set; }
        public string foregroundWindowHandle { get; set; }
    }

    internal static class Program
    {
        private const uint INPUT_KEYBOARD = 1;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_UNICODE = 0x0004;

        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();

        [STAThread]
        private static int Main()
        {
            Console.InputEncoding = new UTF8Encoding(false);
            Console.OutputEncoding = new UTF8Encoding(false);

            Send(new WorkerResponse
            {
                type = "ready",
                ok = true
            });

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                WorkerRequest request = null;
                try
                {
                    request = Serializer.Deserialize<WorkerRequest>(line);
                    if (request == null || string.IsNullOrWhiteSpace(request.type))
                    {
                        throw new InvalidOperationException("Invalid worker request.");
                    }

                    switch (request.type)
                    {
                        case "warmup":
                            Send(new WorkerResponse
                            {
                                id = request.id,
                                type = "warmup",
                                ok = true,
                                foregroundWindowHandle = GetForegroundWindowHandle()
                            });
                            break;

                        case "ping":
                            Send(new WorkerResponse
                            {
                                id = request.id,
                                type = "ping",
                                ok = true
                            });
                            break;

                        case "sendTextUnicode":
                            HandleSendTextUnicode(request);
                            break;

                        case "shutdown":
                            Send(new WorkerResponse
                            {
                                id = request.id,
                                type = "shutdown",
                                ok = true
                            });
                            return 0;

                        default:
                            throw new InvalidOperationException("Unsupported request type: " + request.type);
                    }
                }
                catch (Exception ex)
                {
                    Send(new WorkerResponse
                    {
                        id = request != null ? request.id : null,
                        ok = false,
                        error = ex.Message,
                        errorCode = "worker_error",
                        foregroundWindowHandle = GetForegroundWindowHandle()
                    });
                }
            }

            return 0;
        }

        private static void HandleSendTextUnicode(WorkerRequest request)
        {
            var currentHandle = GetForegroundWindowHandle();
            if (!string.IsNullOrEmpty(request.expectedWindowHandle) &&
                !string.Equals(request.expectedWindowHandle, currentHandle, StringComparison.OrdinalIgnoreCase))
            {
                Send(new WorkerResponse
                {
                    id = request.id,
                    type = "sendTextUnicode",
                    ok = false,
                    error = "Foreground window changed during Unicode input.",
                    errorCode = "focus_changed",
                    foregroundWindowHandle = currentHandle
                });
                return;
            }

            var text = request.text ?? string.Empty;
            if (text.Length == 0)
            {
                Send(new WorkerResponse
                {
                    id = request.id,
                    type = "sendTextUnicode",
                    ok = true,
                    foregroundWindowHandle = currentHandle
                });
                return;
            }

            var inputs = new List<INPUT>(text.Length * 2);
            foreach (var codeUnit in text)
            {
                inputs.Add(CreateKeyboardInput(codeUnit, false));
                inputs.Add(CreateKeyboardInput(codeUnit, true));
            }

            var sent = SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));
            if (sent != inputs.Count)
            {
                var error = Marshal.GetLastWin32Error();
                Send(new WorkerResponse
                {
                    id = request.id,
                    type = "sendTextUnicode",
                    ok = false,
                    error = "SendInput failed with error " + error + ".",
                    errorCode = "sendinput_failed",
                    foregroundWindowHandle = currentHandle
                });
                return;
            }

            Send(new WorkerResponse
            {
                id = request.id,
                type = "sendTextUnicode",
                ok = true,
                foregroundWindowHandle = currentHandle
            });
        }

        private static INPUT CreateKeyboardInput(char codeUnit, bool keyUp)
        {
            return new INPUT
            {
                type = INPUT_KEYBOARD,
                U = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = 0,
                        wScan = codeUnit,
                        dwFlags = KEYEVENTF_UNICODE | (keyUp ? KEYEVENTF_KEYUP : 0),
                        dwExtraInfo = UIntPtr.Zero,
                        time = 0
                    }
                }
            };
        }

        private static string GetForegroundWindowHandle()
        {
            return GetForegroundWindow().ToInt64().ToString("X");
        }

        private static void Send(WorkerResponse response)
        {
            Console.WriteLine(Serializer.Serialize(response));
            Console.Out.Flush();
        }

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public InputUnion U;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)]
            public KEYBDINPUT ki;

            [FieldOffset(0)]
            public MOUSEINPUT mi;

            [FieldOffset(0)]
            public HARDWAREINPUT hi;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct HARDWAREINPUT
        {
            public uint uMsg;
            public ushort wParamL;
            public ushort wParamH;
        }
    }
}
