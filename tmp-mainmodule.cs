using System;
using System.Diagnostics;
namespace Probe {
  internal static class Program {
    [STAThread]
    private static void Main() {
      Console.WriteLine(Process.GetCurrentProcess().MainModule != null ? Process.GetCurrentProcess().MainModule.FileName : "no-main-module");
    }
  }
}
