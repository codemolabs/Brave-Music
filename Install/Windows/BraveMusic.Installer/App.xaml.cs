using System;
using Microsoft.UI.Xaml;

namespace BraveMusic.Installer
{
    /// <summary>
    /// Provides application-specific behavior to supplement the default Application class.
    /// Uses Windows App SDK & WinUI 3 runtime.
    /// </summary>
    public partial class App : Application
    {
        private Window? m_window;

        public App()
        {
            this.InitializeComponent();
        }

        protected override void OnLaunched(Microsoft.UI.Xaml.LaunchActivatedEventArgs args)
        {
            m_window = new MainWindow();
            m_window.Activate();
        }
    }
}

