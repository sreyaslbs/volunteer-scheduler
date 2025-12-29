export default function HelpPage() {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <iframe
                src="/user-guide.html"
                title="User Guide"
                className="w-full h-[calc(100vh-120px)] border-0"
                sandbox="allow-same-origin"
            />
        </div>
    );
}
