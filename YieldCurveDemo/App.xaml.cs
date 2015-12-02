using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;

namespace YieldCurveDemo
{
    /// <summary>
    /// Interaction logic for App.xaml
    /// </summary>
    public partial class App : Application
    {
        private void Application_Startup(object sender, StartupEventArgs e)
        {
            BrowserHelper.SetBrowserVersion(11000);
        }
    }

    static class BrowserHelper
    {
        // http://stackoverflow.com/questions/17922308/use-latest-version-of-ie-in-webbrowser-control
        // https://msdn.microsoft.com/en-us/library/ee330730(VS.85).aspx#browser_emulation
        public static void SetBrowserVersion(int version)
        {
            var processName = System.Diagnostics.Process.GetCurrentProcess().ProcessName + ".exe";
            using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                @"SOFTWARE\Microsoft\Internet Explorer\Main\FeatureControl\FEATURE_BROWSER_EMULATION", true))
            {
                key.SetValue(processName, version, Microsoft.Win32.RegistryValueKind.DWord);
            }
        }
    }
}
