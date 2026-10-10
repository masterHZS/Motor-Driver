#include <QEvent>
#include <QGuiApplication>
#include <QKeyEvent>
#include <QQmlContext>
#include <QQmlApplicationEngine>

#include "CCommManager.h"
#include "CParameterStore.h"
#include "CTheme.h"

class CThemeKeyFilter : public QObject
{
public:
    CThemeKeyFilter(CTheme *theme, QObject *parent = nullptr)
        : QObject(parent)
        , m_theme(theme)
    {
    }

protected:
    bool eventFilter(QObject *watched, QEvent *event) override
    {
        if (event->type() == QEvent::KeyPress) {
            auto *keyEvent = static_cast<QKeyEvent *>(event);
            if (keyEvent->key() == Qt::Key_Tab
                && (keyEvent->modifiers() & Qt::ControlModifier) == Qt::NoModifier) {
                m_theme->toggleDarkMode();
                return true;
            }
        }
        return QObject::eventFilter(watched, event);
    }

private:
    CTheme *m_theme = nullptr;
};

int main(int argc, char *argv[])
{
    qputenv("QT_QUICK_CONTROLS_STYLE", "Basic");

    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName(QStringLiteral("HostSoftware"));
    QGuiApplication::setOrganizationName(QStringLiteral("HostSoftware"));

    CTheme theme;
    CCommManager commManager;
    QQmlApplicationEngine engine;
    qmlRegisterType<CParameterStore>("HostSoftware", 1, 0, "CParameterStore");
    engine.rootContext()->setContextProperty(QStringLiteral("theme"), &theme);
    engine.rootContext()->setContextProperty(QStringLiteral("commManager"), &commManager);
    app.installEventFilter(new CThemeKeyFilter(&theme, &app));

    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app,
                     []() { QCoreApplication::exit(-1); }, Qt::QueuedConnection);
    engine.loadFromModule("HostSoftware", "Main");

    return app.exec();
}
